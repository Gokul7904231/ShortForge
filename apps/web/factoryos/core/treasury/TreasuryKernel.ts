/**
 * ShortForge / FactoryOS — Treasurer Constitutional Kernel
 *
 * This is deliberately deterministic. No model is involved in deciding whether
 * a Treasury reservation is valid, bounded, idempotent, or allowed to settle.
 */

import {
  DEFAULT_TREASURY_POLICY,
  type TreasuryAccount,
  type TreasuryBudgetEnvelope,
  type TreasuryCommand,
  type TreasuryConsumption,
  type TreasuryEconomicPermit,
  type TreasuryLedgerEvent,
  type TreasuryPolicy,
  type TreasuryPriority,
  type TreasuryReservation,
  type TreasuryReport,
} from "./TreasuryContracts";
import { TreasuryPriceRegistry } from "./TreasuryPriceRegistry";
import type { TreasuryLedgerStore, TreasuryLedgerTransaction } from "./TreasuryLedger";

export class TreasuryDeniedError extends Error {
  readonly code = "TREASURY_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "TreasuryDeniedError";
  }
}

function uuid(prefix: string): string {
  return `${prefix}_${cryptoRandomId()}`;
}

function cryptoRandomId(): string {
  const bytes = new Uint8Array(12);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
    return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new TreasuryDeniedError(`${name} must be finite and >= 0`);
}

function priorityRank(priority: TreasuryPriority): number {
  return { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 }[priority];
}

function createEvent(
  eventType: TreasuryLedgerEvent["eventType"],
  accountId: string,
  payload: Record<string, unknown>,
  context?: Partial<Pick<TreasuryLedgerEvent, "commandId" | "reservationId" | "missionId" | "runId" | "floorId" | "taskId" | "amountUsd" | "capacityUnits">>,
  now = new Date(),
): TreasuryLedgerEvent {
  return {
    eventId: uuid("tevt"),
    eventType,
    eventVersion: 1,
    accountId,
    actorAuthority: "TREASURER",
    occurredAt: now.toISOString(),
    payload,
    ...context,
  };
}

export class TreasuryKernel {
  constructor(
    private readonly ledger: TreasuryLedgerStore,
    private readonly priceRegistry: TreasuryPriceRegistry = new TreasuryPriceRegistry(),
    private readonly policy: TreasuryPolicy = DEFAULT_TREASURY_POLICY,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async initialize(): Promise<void> {
    await this.ledger.initialize();
  }

  getPolicy(): TreasuryPolicy {
    return structuredClone(this.policy);
  }

  async quote(command: TreasuryCommand) {
    this.validateCommand(command);
    const quote = this.priceRegistry.quote(
      command.commandId,
      command.expiresAt,
      command.resourceRequest,
      command.budgetEnvelope.maxCostUsd,
      command.budgetEnvelope.maxCapacityUnits ?? 0,
      this.now(),
    );
    await this.ledger.atomic(async (tx) => {
      await tx.appendEvent(
        createEvent(
          "TREASURY_COMMAND_ACCEPTED",
          command.accountId,
          { issuer: command.issuer, purpose: command.purpose, scopeDigest: command.scopeDigest },
          {
            commandId: command.commandId,
            missionId: command.missionId,
            runId: command.runId,
            floorId: command.floorId,
            taskId: command.taskId,
          },
          this.now(),
        ),
      );
      await tx.appendEvent(
        createEvent(
          "RESOURCE_QUOTED",
          command.accountId,
          { quoteId: quote.quoteId, pricingVersion: quote.pricingVersion, assumptions: quote.assumptions },
          { commandId: command.commandId, missionId: command.missionId, amountUsd: quote.upperBoundCostUsd, capacityUnits: quote.upperBoundCapacityUnits },
          this.now(),
        ),
      );
    });
    return quote;
  }

  async reserve(command: TreasuryCommand): Promise<{ reservation: TreasuryReservation; permit: TreasuryEconomicPermit }> {
    this.validateCommand(command);
    const quote = await this.quote(command);
    const now = this.now();
    const ttlMs = Math.min(
      Math.max(new Date(command.expiresAt).getTime() - now.getTime(), 1),
      this.policy.maxReservationTtlMs,
    );
    const reservationId = uuid("tres");

    const reservation = await this.ledger.atomic(async (tx) => {
      const existing = await tx.getReservationByCommandId(command.commandId);
      if (existing) return existing;

      const account = await tx.getAccount(command.accountId);
      if (!account) throw new TreasuryDeniedError(`Treasury account not found: ${command.accountId}`);

      this.assertAdmissible(account, command.budgetEnvelope, command.priority);
      const reserveUsd = command.budgetEnvelope.maxCostUsd;
      const reserveCapacity = command.budgetEnvelope.maxCapacityUnits ?? 0;

      if (account.availableUsd < reserveUsd) {
        await tx.appendEvent(createEvent(
          "SPEND_DENIED",
          account.accountId,
          { reason: "INSUFFICIENT_USD", availableUsd: account.availableUsd, requestedUsd: reserveUsd },
          { commandId: command.commandId, missionId: command.missionId, amountUsd: reserveUsd, capacityUnits: reserveCapacity },
          now,
        ));
        throw new TreasuryDeniedError(`Insufficient Treasury USD: available=${account.availableUsd}, requested=${reserveUsd}`);
      }
      if (account.availableCapacityUnits < reserveCapacity) {
        await tx.appendEvent(createEvent(
          "SPEND_DENIED",
          account.accountId,
          { reason: "INSUFFICIENT_CAPACITY", availableCapacityUnits: account.availableCapacityUnits, requestedCapacityUnits: reserveCapacity },
          { commandId: command.commandId, missionId: command.missionId, amountUsd: reserveUsd, capacityUnits: reserveCapacity },
          now,
        ));
        throw new TreasuryDeniedError(
          `Insufficient Treasury capacity: available=${account.availableCapacityUnits}, requested=${reserveCapacity}`,
        );
      }

      const created: TreasuryReservation = {
        reservationId,
        commandId: command.commandId,
        accountId: command.accountId,
        missionId: command.missionId,
        runId: command.runId,
        floorId: command.floorId,
        taskId: command.taskId,
        attemptId: command.attemptId,
        status: "ACTIVE",
        reservedCostUsd: reserveUsd,
        reservedCapacityUnits: reserveCapacity,
        maxTokens: command.budgetEnvelope.maxTokens,
        maxDurationMs: command.budgetEnvelope.maxDurationMs,
        maxRetries: command.budgetEnvelope.maxRetries,
        verificationRequired: command.resourceRequest.some((request) => request.verificationRequired === true),
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        updatedAt: now.toISOString(),
      };

      const nextAccount: TreasuryAccount = {
        ...account,
        availableUsd: account.availableUsd - reserveUsd,
        reservedUsd: account.reservedUsd + reserveUsd,
        availableCapacityUnits: account.availableCapacityUnits - reserveCapacity,
        reservedCapacityUnits: account.reservedCapacityUnits + reserveCapacity,
        version: account.version + 1,
        updatedAt: now.toISOString(),
      };

      await tx.putAccount(nextAccount);
      await tx.putReservation(created);
      await tx.appendEvent(createEvent(
        "RESOURCE_RESERVED",
        account.accountId,
        { quoteId: quote.quoteId, expiresAt: created.expiresAt },
        {
          commandId: command.commandId,
          reservationId: created.reservationId,
          missionId: command.missionId,
          runId: command.runId,
          floorId: command.floorId,
          taskId: command.taskId,
          amountUsd: reserveUsd,
          capacityUnits: reserveCapacity,
        },
        now,
      ));
      return created;
    });

    return {
      reservation,
      permit: {
        permitId: uuid("tpermit"),
        reservationId: reservation.reservationId,
        commandId: reservation.commandId,
        accountId: reservation.accountId,
        maxCostUsd: reservation.reservedCostUsd,
        maxCapacityUnits: reservation.reservedCapacityUnits,
        expiresAt: reservation.expiresAt,
        issuedAt: now.toISOString(),
        status: "ACTIVE",
      },
    };
  }

  async settle(reservationId: string, consumption: TreasuryConsumption): Promise<TreasuryReservation> {
    const now = this.now();
    assertPositiveFinite(consumption.actualCostUsd, "actualCostUsd");
    assertPositiveFinite(consumption.actualCapacityUnits, "actualCapacityUnits");
    if (!consumption.executionEvidenceId) throw new TreasuryDeniedError("executionEvidenceId is required");

    return this.ledger.atomic(async (tx) => {
      const reservation = await tx.getReservation(reservationId);
      if (!reservation) throw new TreasuryDeniedError(`Treasury reservation not found: ${reservationId}`);
      if (reservation.status === "SETTLED") return reservation;
      if (reservation.status !== "ACTIVE") {
        throw new TreasuryDeniedError(`Cannot settle reservation in state ${reservation.status}`);
      }

      if (consumption.actualCostUsd > reservation.reservedCostUsd ||
          consumption.actualCapacityUnits > reservation.reservedCapacityUnits) {
        const account = await tx.getAccount(reservation.accountId);
        if (account) {
          await tx.putAccount({
            ...account,
            mode: "FROZEN",
            version: account.version + 1,
            updatedAt: now.toISOString(),
          });
          await tx.appendEvent(createEvent(
            "TREASURY_FROZEN",
            account.accountId,
            { reason: "ACTUAL_CONSUMPTION_EXCEEDED_RESERVATION", reservationId, actualCostUsd: consumption.actualCostUsd, reservedCostUsd: reservation.reservedCostUsd },
            { reservationId, commandId: reservation.commandId, missionId: reservation.missionId },
            now,
          ));
        }
        await tx.putReservation({ ...reservation, status: "BREACHED", updatedAt: now.toISOString() });
        await tx.appendEvent(createEvent(
          "BUDGET_BREACH",
          reservation.accountId,
          { actualCostUsd: consumption.actualCostUsd, reservedCostUsd: reservation.reservedCostUsd, executionEvidenceId: consumption.executionEvidenceId },
          { reservationId, commandId: reservation.commandId, missionId: reservation.missionId, amountUsd: consumption.actualCostUsd, capacityUnits: consumption.actualCapacityUnits },
          now,
        ));
        throw new TreasuryDeniedError("Actual consumption exceeded reserved Treasury envelope; Treasury frozen");
      }

      if (reservation.verificationRequired && (!consumption.verified || !consumption.verificationReceiptId)) {
        throw new TreasuryDeniedError("Verified settlement requires a verification receipt for this reservation");
      }

      const account = await tx.getAccount(reservation.accountId);
      if (!account) throw new TreasuryDeniedError(`Treasury account not found: ${reservation.accountId}`);

      const releaseUsd = reservation.reservedCostUsd - consumption.actualCostUsd;
      const releaseCapacity = reservation.reservedCapacityUnits - consumption.actualCapacityUnits;
      const nextAccount: TreasuryAccount = {
        ...account,
        reservedUsd: account.reservedUsd - reservation.reservedCostUsd,
        settledUsd: account.settledUsd + consumption.actualCostUsd,
        availableUsd: account.availableUsd + releaseUsd,
        reservedCapacityUnits: account.reservedCapacityUnits - reservation.reservedCapacityUnits,
        settledCapacityUnits: account.settledCapacityUnits + consumption.actualCapacityUnits,
        availableCapacityUnits: account.availableCapacityUnits + releaseCapacity,
        version: account.version + 1,
        updatedAt: now.toISOString(),
      };
      const nextReservation = {
        ...reservation,
        status: "SETTLED" as const,
        updatedAt: now.toISOString(),
      };

      await tx.putAccount(nextAccount);
      await tx.putReservation(nextReservation);
      await tx.appendEvent(createEvent(
        "RESOURCE_CONSUMED",
        reservation.accountId,
        { actualTokens: consumption.actualTokens, actualDurationMs: consumption.actualDurationMs, executionEvidenceId: consumption.executionEvidenceId, verified: consumption.verified },
        { reservationId, commandId: reservation.commandId, missionId: reservation.missionId, amountUsd: consumption.actualCostUsd, capacityUnits: consumption.actualCapacityUnits },
        now,
      ));
      await tx.appendEvent(createEvent(
        "SPEND_RECONCILED",
        reservation.accountId,
        { reservedUsd: reservation.reservedCostUsd, actualCostUsd: consumption.actualCostUsd, releasedUsd: releaseUsd, verificationReceiptId: consumption.verificationReceiptId },
        { reservationId, commandId: reservation.commandId, missionId: reservation.missionId, amountUsd: consumption.actualCostUsd, capacityUnits: consumption.actualCapacityUnits },
        now,
      ));
      return nextReservation;
    });
  }

  async release(reservationId: string, reason = "RELEASED"): Promise<TreasuryReservation> {
    const now = this.now();
    return this.ledger.atomic(async (tx) => {
      const reservation = await tx.getReservation(reservationId);
      if (!reservation) throw new TreasuryDeniedError(`Treasury reservation not found: ${reservationId}`);
      if (reservation.status === "RELEASED" || reservation.status === "EXPIRED") return reservation;
      if (reservation.status !== "ACTIVE") {
        throw new TreasuryDeniedError(`Cannot release reservation in state ${reservation.status}`);
      }

      const account = await tx.getAccount(reservation.accountId);
      if (!account) throw new TreasuryDeniedError(`Treasury account not found: ${reservation.accountId}`);

      const nextAccount: TreasuryAccount = {
        ...account,
        reservedUsd: account.reservedUsd - reservation.reservedCostUsd,
        availableUsd: account.availableUsd + reservation.reservedCostUsd,
        reservedCapacityUnits: account.reservedCapacityUnits - reservation.reservedCapacityUnits,
        availableCapacityUnits: account.availableCapacityUnits + reservation.reservedCapacityUnits,
        version: account.version + 1,
        updatedAt: now.toISOString(),
      };
      const nextReservation = {
        ...reservation,
        status: reason === "EXPIRED" ? "EXPIRED" as const : "RELEASED" as const,
        updatedAt: now.toISOString(),
      };

      await tx.putAccount(nextAccount);
      await tx.putReservation(nextReservation);
      await tx.appendEvent(createEvent(
        reason === "EXPIRED" ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASED",
        reservation.accountId,
        { reason },
        { reservationId, commandId: reservation.commandId, missionId: reservation.missionId, amountUsd: reservation.reservedCostUsd, capacityUnits: reservation.reservedCapacityUnits },
        now,
      ));
      return nextReservation;
    });
  }

  async expireDueReservations(accountId?: string): Promise<number> {
    const active = await this.ledger.listActiveReservations(accountId);
    let expired = 0;
    for (const reservation of active) {
      if (new Date(reservation.expiresAt).getTime() <= this.now().getTime()) {
        await this.release(reservation.reservationId, "EXPIRED");
        expired += 1;
      }
    }
    return expired;
  }

  async freeze(command: TreasuryCommand, reason: string): Promise<TreasuryAccount> {
    this.validateCommand(command);
    return this.setMode(command.accountId, "FROZEN", command, reason);
  }

  async unfreeze(command: TreasuryCommand, reason: string): Promise<TreasuryAccount> {
    this.validateCommand(command);
    return this.setMode(command.accountId, "OPEN", command, reason);
  }

  async report(accountId: string, limit = 50): Promise<TreasuryReport> {
    const account = await this.ledger.getAccount(accountId);
    if (!account) throw new TreasuryDeniedError(`Treasury account not found: ${accountId}`);
    const reservations = await this.ledger.listActiveReservations(accountId);
    const recentEvents = await this.ledger.listRecentEvents(accountId, limit);
    return {
      account,
      activeReservations: reservations.length,
      recentEvents,
      generatedAt: this.now().toISOString(),
    };
  }

  private async setMode(accountId: string, mode: "OPEN" | "FROZEN", command: TreasuryCommand, reason: string): Promise<TreasuryAccount> {
    const now = this.now();
    return this.ledger.atomic(async (tx) => {
      const account = await tx.getAccount(accountId);
      if (!account) throw new TreasuryDeniedError(`Treasury account not found: ${accountId}`);
      const next = { ...account, mode, version: account.version + 1, updatedAt: now.toISOString() };
      await tx.putAccount(next);
      await tx.appendEvent(createEvent(
        mode === "FROZEN" ? "TREASURY_FROZEN" : "TREASURY_UNFROZEN",
        accountId,
        { reason, overseerCommandId: command.overseerCommandId },
        { commandId: command.commandId, missionId: command.missionId },
        now,
      ));
      return next;
    });
  }

  private validateCommand(command: TreasuryCommand): void {
    if (!command.commandId || !command.overseerCommandId) {
      throw new TreasuryDeniedError("Treasury commandId and overseerCommandId are required");
    }
    if (command.issuer.authority !== "OVERSEER") {
      throw new TreasuryDeniedError("Treasurer accepts discretionary commands only from Overseer");
    }
    if (!command.issuer.issuerId) throw new TreasuryDeniedError("Overseer issuerId is required");
    if (!command.accountId || !command.missionId || !command.purpose) {
      throw new TreasuryDeniedError("Treasury command accountId, missionId and purpose are required");
    }
    if (!command.idempotencyKey || !command.scopeDigest) {
      throw new TreasuryDeniedError("Treasury idempotencyKey and scopeDigest are required");
    }
    const expiresAtMs = new Date(command.expiresAt).getTime();
    const nowMs = this.now().getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
      throw new TreasuryDeniedError("Treasury command is expired");
    }

    const envelope: TreasuryBudgetEnvelope = command.budgetEnvelope;
    assertPositiveFinite(envelope.maxCostUsd, "maxCostUsd");
    assertPositiveFinite(envelope.maxCapacityUnits ?? 0, "maxCapacityUnits");
    if (envelope.maxCostUsd > this.policy.maxSingleReservationUsd) {
      throw new TreasuryDeniedError(`Reservation exceeds Treasury single-reservation ceiling of $${this.policy.maxSingleReservationUsd}`);
    }
    if ((envelope.maxCapacityUnits ?? 0) > this.policy.maxSingleCapacityUnits) {
      throw new TreasuryDeniedError("Reservation exceeds Treasury capacity ceiling");
    }
  }

  private assertAdmissible(account: TreasuryAccount, envelope: TreasuryBudgetEnvelope, priority: TreasuryPriority): void {
    if (account.mode === "FROZEN" || this.policy.mode === "FROZEN") {
      throw new TreasuryDeniedError("Treasury is FROZEN: no new discretionary reservations");
    }
    if (account.mode === "DEFENSIVE" || this.policy.mode === "DEFENSIVE") {
      if (priorityRank(priority) > priorityRank(this.policy.defensiveMaxPriority)) {
        throw new TreasuryDeniedError("Treasury DEFENSIVE mode blocks high-priority discretionary spend");
      }
      if (envelope.maxCostUsd > this.policy.defensiveMaxReservationUsd) {
        throw new TreasuryDeniedError("Treasury DEFENSIVE mode blocks large reservations");
      }
    }
  }
}
