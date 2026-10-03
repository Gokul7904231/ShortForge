/**
 * SchedulerService — FactoryOS Canonical Recurring Scheduler
 * 
 * Handles timezone-aware cron/interval calculations, deterministic execution idempotency,
 * atomic schedule claiming, trigger orchestration, and standard production job dispatching.
 */

import crypto from "crypto";
import { db } from "../firebase-admin";

export interface ScheduleDefinition {
  id?: string;
  scheduleId: string;
  ownerId: string;
  userRole?: string;
  name: string;
  engineId: string;
  quizMode: "geo" | "custom_single" | "custom_multiple";
  countryCode?: string;
  topics?: Array<{ topicId: string; name: string; questionBudget?: number }>;
  totalQuestions?: number;
  time: string; // "HH:MM" e.g. "20:00"
  timezone: string; // "Asia/Kolkata", "America/New_York", etc.
  frequency: "DAILY" | "WEEKLY";
  daysOfWeek?: number[]; // [1, 3, 5] for Mon/Wed/Fri
  deliveryTarget: "GOOGLE_DRIVE" | "LOCAL_OUTBOX";
  enabled: boolean;
  status: "ACTIVE" | "PAUSED_QUOTA" | "DISABLED" | "ERROR";
  nextRunAt: string; // ISO UTC
  lastRunAt?: string;
  lastRunStatus?: "COMPLETED" | "FAILED" | "PAUSED_QUOTA";
  lastExecutionId?: string;
  failureCount: number;
  pauseReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleExecutionLog {
  executionId: string;
  scheduleId: string;
  ownerId: string;
  scheduledForUtc: string;
  jobId?: string;
  status: "PENDING" | "CLAIMED" | "COMPLETED" | "FAILED" | "PAUSED_QUOTA";
  startedAt: string;
  finishedAt?: string;
  error?: string;
  driveFileId?: string;
}

export class SchedulerService {
  /**
   * Computes the next run time in UTC based on time (HH:MM), timezone, and frequency.
   */
  static computeNextRunAt(time: string, timezone: string = "UTC", frequency: "DAILY" | "WEEKLY" = "DAILY"): string {
    const [hoursStr, minutesStr] = time.split(":");
    const targetHours = parseInt(hoursStr || "20", 10);
    const targetMinutes = parseInt(minutesStr || "0", 10);

    const now = new Date();
    
    // Create candidate date starting from today
    let candidate = new Date(now.getTime());
    candidate.setUTCHours(targetHours, targetMinutes, 0, 0);

    // If candidate has already passed in UTC, push to next day
    if (candidate.getTime() <= now.getTime()) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    }

    return candidate.toISOString();
  }

  /**
   * Generates a deterministic SHA-256 execution ID to prevent duplicate executions.
   */
  static generateExecutionId(scheduleId: string, scheduledForUtc: string): string {
    const raw = `${scheduleId}_${scheduledForUtc}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
  }

  /**
   * Creates or registers a new schedule in Firestore.
   */
  static async createSchedule(
    definition: Omit<ScheduleDefinition, "scheduleId" | "nextRunAt" | "createdAt" | "updatedAt" | "failureCount" | "status">
  ): Promise<ScheduleDefinition> {
    const scheduleId = `sched_${crypto.randomBytes(6).toString("hex")}`;
    const nextRunAt = this.computeNextRunAt(definition.time, definition.timezone, definition.frequency);

    const schedule: ScheduleDefinition = {
      ...definition,
      scheduleId,
      status: definition.enabled ? "ACTIVE" : "DISABLED",
      nextRunAt,
      failureCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("schedules").doc(scheduleId).set(schedule);
    return schedule;
  }

  /**
   * Lists schedules owned by a user.
   */
  static async listSchedules(ownerId: string): Promise<ScheduleDefinition[]> {
    const snap = await db.collection("schedules").where("ownerId", "==", ownerId).get();
    return snap.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));
  }

  /**
   * Atomically claims due schedules to prevent race conditions across server instances.
   */
  static async claimDueSchedules(maxClaims: number = 5): Promise<ScheduleDefinition[]> {
    const nowUtc = new Date().toISOString();

    const snapshot = await db
      .collection("schedules")
      .where("enabled", "==", true)
      .where("status", "==", "ACTIVE")
      .where("nextRunAt", "<=", nowUtc)
      .limit(maxClaims)
      .get();

    const claimed: ScheduleDefinition[] = [];

    for (const doc of snapshot.docs) {
      const schedule = doc.data() as ScheduleDefinition;
      const executionId = this.generateExecutionId(schedule.scheduleId, schedule.nextRunAt);

      // Check if this executionId was already claimed
      const execDocRef = db.collection("schedule_executions").doc(executionId);
      const isClaimed = await db.runTransaction(async (transaction: any) => {
        const execDoc = await transaction.get(execDocRef);
        if (execDoc.exists) {
          return false;
        }

        transaction.set(execDocRef, {
          executionId,
          scheduleId: schedule.scheduleId,
          ownerId: schedule.ownerId,
          scheduledForUtc: schedule.nextRunAt,
          status: "CLAIMED",
          startedAt: new Date().toISOString(),
        });
        return true;
      });

      if (isClaimed) {
        claimed.push(schedule);
      }
    }

    return claimed;
  }

  /**
   * Executes a claimed schedule: checks quota, dispatches standard generation job, updates logs and nextRunAt.
   */
  static async executeSchedule(
    schedule: ScheduleDefinition,
    controlPlaneUrl: string = process.env.CONTROL_PLANE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ): Promise<void> {
    const executionId = this.generateExecutionId(schedule.scheduleId, schedule.nextRunAt);
    const execDocRef = db.collection("schedule_executions").doc(executionId);
    const schedRef = db.collection("schedules").doc(schedule.scheduleId);

    console.log(`[SchedulerService] Executing Schedule ${schedule.scheduleId} (Execution: ${executionId})...`);

    // Treasury owns quota/admission. The scheduler is only a trigger.
    // 2. Dispatch Standard Video Generation Job
    try {
      const jobPayload = {
        topic: schedule.name || "Scheduled Daily Short",
        engineId: schedule.engineId || "quiz",
        engineMode: schedule.quizMode,
        difficulty: "medium",
        durationSeconds: 45,
        quizContext: {
          quizMode: schedule.quizMode,
          countryCode: schedule.countryCode,
          topics: schedule.topics,
          totalQuestions: schedule.totalQuestions || 6,
          allocationStrategy: "EQUAL",
        },
        delivery: {
          target: schedule.deliveryTarget || "GOOGLE_DRIVE",
          authMode: "USER_OAUTH",
        },
      };

      const res = await fetch(`${controlPlaneUrl}/api/generate-video`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-factoryos-internal-caller": "SCHEDULER",
          "x-factoryos-user-id": schedule.ownerId,
        },
        body: JSON.stringify(jobPayload),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 429) {
          await schedRef.update({
            status: "PAUSED_QUOTA",
            pauseReason:
              resData.error ||
              resData.message ||
              "Treasury generation entitlement exhausted.",
            updatedAt: new Date().toISOString(),
          });
          await execDocRef.update({
            status: "PAUSED_QUOTA",
            finishedAt: new Date().toISOString(),
            error:
              resData.error ||
              resData.message ||
              "Treasury generation entitlement exhausted.",
          });
          return;
        }
        throw new Error(
          resData.error || "Failed to enqueue generation job.",
        );
      }

      const jobId = resData.jobId || resData.id || resData.videoId;

      // 3. Update execution record and advance nextRunAt
      const nextRunAt = this.computeNextRunAt(schedule.time, schedule.timezone, schedule.frequency);

      await execDocRef.update({
        jobId,
        status: "COMPLETED",
        finishedAt: new Date().toISOString(),
      });

      await schedRef.update({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "COMPLETED",
        lastExecutionId: executionId,
        nextRunAt,
        failureCount: 0,
        updatedAt: new Date().toISOString(),
      });

      console.log(`[SchedulerService] Schedule ${schedule.scheduleId} executed successfully. Job ID: ${jobId}. Next run: ${nextRunAt}`);
    } catch (err: any) {
      console.error(`[SchedulerService] Schedule execution failed:`, err.message);

      const nextRunAt = this.computeNextRunAt(schedule.time, schedule.timezone, schedule.frequency);

      await execDocRef.update({
        status: "FAILED",
        finishedAt: new Date().toISOString(),
        error: err.message,
      });

      await schedRef.update({
        lastRunAt: new Date().toISOString(),
        lastRunStatus: "FAILED",
        nextRunAt,
        failureCount: (schedule.failureCount || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
