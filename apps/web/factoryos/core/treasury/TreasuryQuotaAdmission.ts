/**
 * Treasury-controlled user entitlement admission.
 *
 * Treasury owns the admission decision. Firestore quota documents remain a
 * compatibility projection for existing UI/history and migration reconciliation.
 */
import { db } from "../../../lib/firebase-admin";
import {
  getCalendarMonthBounds,
  getUserQuota,
  resolveTier,
  type UserQuotaInfo,
  QuotaExceededError,
} from "../../../lib/quota/quota-service";
import { createTreasuryAccount } from "./TreasuryLedger";
import { computeTreasuryExecutionScopeDigest } from "./TreasuryScope";
import type { TreasuryEconomicPermit, TreasuryReservation } from "./TreasuryContracts";
import type { TreasuryService } from "./TreasuryService";

export interface TreasuryQuotaAdmissionContext {
  readonly userId: string;
  readonly role: string;
  readonly jobId: string;
  readonly missionId: string;
  readonly runId: string;
  readonly overseerCommandId: string;
  readonly expiresAt: string;
}

export interface TreasuryQuotaReservationResult {
  readonly reservation?: TreasuryReservation;
  readonly permit?: TreasuryEconomicPermit;
  readonly quota: UserQuotaInfo;
  readonly unlimited: boolean;
}

function quotaAccountId(quota: UserQuotaInfo): string {
  const periodKey =
    quota.periodType === "CALENDAR_MONTH"
      ? getCalendarMonthBounds().periodKey
      : "lifetime";
  return "quota:" + quota.userId + ":" + periodKey;
}

function buildQuotaAccount(
  quota: UserQuotaInfo,
  accountId: string,
): ReturnType<typeof createTreasuryAccount> {
  const limit = Number.isFinite(quota.limit) ? Math.max(0, quota.limit) : 0;
  const completed = Math.max(
    0,
    Math.min(limit, Math.floor(quota.completed)),
  );
  const remaining = Math.max(0, limit - completed);

  return {
    accountId,
    currency: "USD",
    budgetUsd: 0,
    availableUsd: 0,
    reservedUsd: 0,
    settledUsd: 0,
    capacityUnits: limit,
    availableCapacityUnits: remaining,
    reservedCapacityUnits: 0,
    settledCapacityUnits: completed,
    tokenCapacityUnits: 0,
    availableTokenCapacityUnits: 0,
    reservedTokenCapacityUnits: 0,
    settledTokenCapacityUnits: 0,
    mode: "OPEN",
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

export class TreasuryQuotaAdmission {
  constructor(private readonly treasury: TreasuryService) {}

  async reserveGenerationSlot(
    context: TreasuryQuotaAdmissionContext,
  ): Promise<TreasuryQuotaReservationResult> {
    const tier = resolveTier(context.role);
    const quota = await getUserQuota(context.userId, context.role);

    if (tier === "ADMIN" || tier === "OWNER" || quota.isUnlimited) {
      return {
        quota,
        unlimited: true,
      };
    }

    if (quota.isExceeded || quota.remaining <= 0) {
      throw new QuotaExceededError(
        quota.isExceeded
          ? "Treasury quota exhausted for user " + context.userId
          : "Treasury quota has no remaining generation capacity",
        quota,
      );
    }

    const accountId = quotaAccountId(quota);
    const existing = await this.treasury.getAccount(accountId);
    if (!existing) {
      await this.treasury.ensureAccount(buildQuotaAccount(quota, accountId));
    }

    const response = await this.treasury.reserve({
      commandId: "treasury-quota-" + context.jobId,
      overseerCommandId: context.overseerCommandId,
      issuer: {
        authority: "OVERSEER",
        issuerId: context.overseerCommandId,
      },
      accountId,
      missionId: context.missionId,
      runId: context.runId,
      floorId: "generation-admission",
      taskId: context.jobId,
      attemptId: context.jobId,
      purpose: "User generation entitlement reservation",
      resourceRequest: [{
        kind: "QUOTA",
        quantity: 1,
        unit: "GENERATION_SLOT",
        scarcityUnits: 1,
        verificationRequired: true,
        paidRoute: false,
      }],
      budgetEnvelope: {
        maxCostUsd: 0,
        maxCapacityUnits: 1,
        maxRetries: 0,
      },
      priority: "NORMAL",
      expiresAt: context.expiresAt,
      idempotencyKey: "quota:" + context.userId + ":" + context.jobId,
      scopeDigest: computeTreasuryExecutionScopeDigest({
        version: 1,
        kind: "COMPUTE_OFFER",
        missionId: context.missionId,
        jobId: context.jobId,
        floorId: "generation-admission",
        overseerCommandId: context.overseerCommandId,
        scopeFingerprint:
          context.userId +
          ":" +
          context.role +
          ":" +
          context.jobId,
        resourceId: accountId,
      }),
    });

    await projectQuotaReservation(context.userId, context.role, context.jobId);
    return {
      quota: {
        ...quota,
        reserved: quota.reserved + 1,
        totalUsed: quota.totalUsed + 1,
        remaining: Math.max(0, quota.remaining - 1),
      },
      reservation: response.reservation,
      permit: response.permit,
      unlimited: false,
    };
  }

  async releaseGenerationSlot(
    reservationId: string,
    userId: string,
    role: string,
    jobId: string,
  ): Promise<void> {
    await this.treasury.release(reservationId, "GENERATION_RELEASED");
    await projectQuotaRelease(userId, role, jobId);
  }

  async settleGenerationSlot(
    reservationId: string,
    userId: string,
    role: string,
    jobId: string,
    evidenceId: string,
    verificationReceiptId: string,
  ): Promise<void> {
    await this.treasury.settle(reservationId, {
      reservationId,
      actualCostUsd: 0,
      actualCapacityUnits: 1,
      executionEvidenceId: evidenceId,
      verificationReceiptId,
      verified: true,
      measuredAt: new Date().toISOString(),
    });
    await projectQuotaSettlement(userId, role, jobId);
  }
}

export async function projectQuotaReservation(
  userId: string,
  role: string,
  jobId: string,
): Promise<void> {
  const tier = resolveTier(role);
  if (tier === "ADMIN" || tier === "OWNER") return;
  const { periodKey } = getCalendarMonthBounds();
  const docId = tier === "PRO" ? userId + "_" + periodKey : userId;
  const ref = db.collection("quotas").doc(docId);
  await db.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    const data = doc.exists ? doc.data() || {} : {};
    const slots = { ...(data.reservedSlots || {}) };
    if (slots[jobId]) return;
    slots[jobId] = {
      jobId,
      reservedAt: new Date().toISOString(),
      source: "TREASURY",
    };
    tx.set(
      ref,
      {
        userId,
        tier,
        completed:
          typeof data.completed === "number" ? data.completed : 0,
        reservedSlots: slots,
        periodKey: tier === "PRO" ? periodKey : "lifetime",
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  });
}

export async function projectQuotaRelease(
  userId: string,
  role: string,
  jobId: string,
): Promise<void> {
  const tier = resolveTier(role);
  if (tier === "ADMIN" || tier === "OWNER") return;
  const { periodKey } = getCalendarMonthBounds();
  const docId = tier === "PRO" ? userId + "_" + periodKey : userId;
  const ref = db.collection("quotas").doc(docId);
  await db.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const data = doc.data() || {};
    const slots = { ...(data.reservedSlots || {}) };
    if (!slots[jobId]) return;
    delete slots[jobId];
    tx.update(ref, {
      reservedSlots: slots,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function projectQuotaSettlement(
  userId: string,
  role: string,
  jobId: string,
): Promise<void> {
  const tier = resolveTier(role);
  if (tier === "ADMIN" || tier === "OWNER") return;
  const { periodKey } = getCalendarMonthBounds();
  const docId = tier === "PRO" ? userId + "_" + periodKey : userId;
  const ref = db.collection("quotas").doc(docId);
  await db.runTransaction(async (tx: any) => {
    const doc = await tx.get(ref);
    if (!doc.exists) return;
    const data = doc.data() || {};
    const slots = { ...(data.reservedSlots || {}) };
    if (!slots[jobId]) return;
    delete slots[jobId];
    const completed =
      typeof data.completed === "number" ? data.completed : 0;
    tx.update(ref, {
      reservedSlots: slots,
      completed: completed + 1,
      updatedAt: new Date().toISOString(),
    });
  });
}
