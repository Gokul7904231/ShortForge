/**
 * ShortForge / FactoryOS — Treasurer Constitutional Kernel
 *
 * Deterministic economic admission boundary. No model decides whether spend,
 * reservation, settlement, freeze, or release is constitutionally valid.
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
import type { TreasuryLedgerStore } from "./TreasuryLedger";

export class TreasuryDeniedError extends Error {
  readonly code = "TREASURY_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "TreasuryDeniedError";
  }
}

function cryptoId(prefix: string): string {
  const bytes = new Uint8Array(12);
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Treasury requires a cryptographically secure random source");
  }
  cryptoApi.getRandomValues(bytes);
  return `${prefix}_${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new TreasuryDeniedError(`${name} must be finite and >= 0`);
  }
}

function priorityRank(priority: TreasuryPriority): number {
  return { LOW: 0, NORMAL: 1, HIGH: 2, CRITICAL: 3 }[priority];
}

function event(
  eventType: TreasuryLedgerEvent["eventType"],
  accountId: string,
  payload: Record<string, unknown>,
  context?: Partial<Pick<TreasuryLedgerEvent, "commandId" | "reservationId" | "missionId" | "runId" | "floorId" | "taskId" | "amountUsd" | "capacityUnits">>,
  now = new Date(),
): TreasuryLedgerEvent {
  return {
    eventId: cryptoId("tevt"),
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

  getPriceRegistry(): TreasuryPriceRegistry {
    return this.priceRegistry;
  }

  async ensureAccount(account: TreasuryAccount): Promise<TreasuryAccount> {
    this.validateAccount(account);
    return this.ledger.ensureAccount(account);
  }

  async quote(command: TreasuryCommand): Promise<import("./TreasuryContracts").TreasuryQuote> {
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
      await tx.appendEvent(event(
        "TREASURY_COMMAND_ACCEPTED",
        command.accountId,
        {
          issuer: command.issuer,
          purpose: command.purpose,
          scopeDigest: command.scopeDigest,
        },
        {
          commandId: command.commandId,
          missionId: command.missionId,
          runId: command.runId,
          floorId: command.floorId,
          taskId: command.taskId,
        },
        this.now(),
      ));
      await tx.appendEvent(event(
        "RESOURCE_QUOTED",
        command.accountId,
        {
          quoteId: quote.quoteId,
          pricingVersion: quote.pricingVersion,
          pricingConfidence: quote.pricingConfidence,
          assumptions: quote.assumptions,
        },
        {
          commandId: command.commandId,
          missionId: command.missionId,
          amountUsd: quote.upperBoundCostUsd,
          capacityUnits: quote.upperBoundCapacityUnits,
        },
        this.now(),
      ));
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
    const reservationId = cryptoId("tres");

    let denial: string | null = null;
    const reservation = await this.ledger.atomic(async (tx) => {
      const existing = await tx.getReservationByCommandId(command.commandId);
      if (existing) {
        if (existing.idempotencyKey !== command.idempotencyKey || existing.scopeDigest !== command.scopeDigest) {
          throw new TreasuryDeniedError("Command replay has conflicting idempotency key or scope digest");
        }
        return existing;
      }

      const sameIdempotency = await tx.getReservationByIdempotencyKey(command.accountId, command.idempotencyKey);
      if (sameIdempotency) {
        if (sameIdempotency.scopeDigest !== command.scopeDigest) {
          throw new TreasuryDeniedError("Idempotency key is already bound to a different Treasury scope");
        }
        return sameIdempotency;
      }

      const account = await tx.getAccount(command.accountId);
      if (!account) {
        denial = `Treasury account not found: ${command.accountId}`;
        return null;
      }

      try {
        this.assertAdmissible(account, command.budgetEnvelope, command.priority, command.resourceRequest);
      } catch (error) {
        denial = error instanceof Error ? error.message : "Treasury admission denied";
        await tx.appendEvent(event(
          "SPEND_DENIED",
          account.accountId,
          { reason: denial },
          {
            commandId: command.commandId,
            missionId: command.missionId,
            amountUsd: command.budgetEnvelope.maxCostUsd,
            capacityUnits: command.budgetEnvelope.maxCapacityUnits ?? 0,
          },
          now,
        ));
        return null;
      }

      const reserveUsd = command.budgetEnvelope.maxCostUsd;
      const reserveCapacity = command.budgetEnvelope.maxCapacityUnits ?? 0;
      const reserveTokenCapacity = command.resourceRequest
        .filter((request) => request.kind === "INFERENCE")
        .reduce(
          (sum, request) =>
            sum + Math.max(
              0,
              request.scarcityUnits ?? 0,
              request.unit === "TOKENS"
                ? request.quantity ?? 0
                : 0,
            ),
          0,
        );

      if (account.availableUsd < reserveUsd) {
        denial = `Insufficient Treasury USD: available=${account.availableUsd}, requested=${reserveUsd}`;
        await tx.appendEvent(event(
          "SPEND_DENIED",
          account.accountId,
          { reason: "INSUFFICIENT_USD", availableUsd: account.availableUsd, requestedUsd: reserveUsd },
          {
            commandId: command.commandId,
            missionId: command.missionId,
            amountUsd: reserveUsd,
            capacityUnits: reserveCapacity,
          },
          now,
        ));
        return null;
      }

      if (
        account.availableTokenCapacityUnits < reserveTokenCapacity
      ) {
        denial =
          `Insufficient Treasury token capacity: available=${account.availableTokenCapacityUnits}, requested=${reserveTokenCapacity}`;
        await tx.appendEvent(event(
          "SPEND_DENIED",
          account.accountId,
          {
            reason: "INSUFFICIENT_TOKEN_CAPACITY",
            availableTokenCapacityUnits: account.availableTokenCapacityUnits,
            requestedTokenCapacityUnits: reserveTokenCapacity,
          },
          {
            commandId: command.commandId,
            missionId: command.missionId,
            amountUsd: reserveUsd,
            capacityUnits: reserveTokenCapacity,
          },
          now,
        ));
        return null;
      }

      if (account.availableCapacityUnits < reserveCapacity) {
        denial = `Insufficient Treasury capacity: available=${account.availableCapacityUnits}, requested=${reserveCapacity}`;
        await tx.appendEvent(event(
          "SPEND_DENIED",
          account.accountId,
          {
            reason: "INSUFFICIENT_CAPACITY",
            availableCapacityUnits: account.availableCapacityUnits,
            requestedCapacityUnits: reserveCapacity,
          },
          {
            commandId: command.commandId,
            missionId: command.missionId,
            amountUsd: reserveUsd,
            capacityUnits: reserveCapacity,
          },
          now,
        ));
        return null;
      }

      const created: TreasuryReservation = {
        reservationId,
        commandId: command.commandId,
        overseerCommandId: command.overseerCommandId,
        accountId: command.accountId,
        missionId: command.missionId,
        runId: command.runId,
        floorId: command.floorId,
        taskId: command.taskId,
        attemptId: command.attemptId,
        status: "ACTIVE",
        reservedCostUsd: reserveUsd,
        reservedCapacityUnits: reserveCapacity,
        reservedTokenCapacityUnits: reserveTokenCapacity,
        maxTokens: command.budgetEnvelope.maxTokens,
        maxDurationMs: command.budgetEnvelope.maxDurationMs,
        maxRetries: command.budgetEnvelope.maxRetries,
        verificationRequired: command.resourceRequest.some((request) => request.verificationRequired === true),
        idempotencyKey: command.idempotencyKey,
        scopeDigest: command.scopeDigest,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        updatedAt: now.toISOString(),
      };

      await tx.putAccount({
        ...account,
        availableUsd: account.availableUsd - reserveUsd,
        reservedUsd: account.reservedUsd + reserveUsd,
        availableCapacityUnits: account.availableCapacityUnits - reserveCapacity,
        reservedCapacityUnits: account.reservedCapacityUnits + reserveCapacity,
        availableTokenCapacityUnits:
          account.availableTokenCapacityUnits - reserveTokenCapacity,
        reservedTokenCapacityUnits:
          account.reservedTokenCapacityUnits + reserveTokenCapacity,
        version: account.version + 1,
        updatedAt: now.toISOString(),
      });
      await tx.putReservation(created);

      await tx.appendEvent(event(
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

    if (!reservation) {
      throw new TreasuryDeniedError(denial ?? "Treasury reservation denied");
    }

    return {
      reservation,
      permit: {
        permitId: cryptoId("tpermit"),
        reservationId: reservation.reservationId,
        commandId: reservation.commandId,
        overseerCommandId: reservation.overseerCommandId,
        accountId: reservation.accountId,
        missionId: reservation.missionId,
        runId: reservation.runId,
        floorId: reservation.floorId,
        taskId: reservation.taskId,
        attemptId: reservation.attemptId,
        scopeDigest: reservation.scopeDigest,
        maxCostUsd: reservation.reservedCostUsd,
        maxCapacityUnits: reservation.reservedCapacityUnits,
        maxRetries: reservation.maxRetries ?? 0,
        expiresAt: reservation.expiresAt,
        issuedAt: now.toISOString(),
        status: "ACTIVE",
      },
    };
  }

  async extend(
    reservationId: string,
    command: TreasuryCommand,
  ): Promise<TreasuryReservation> {
    this.validateCommand(command);
    const now = this.now();
    let denial: string | null = null;

    const updated = await this.ledger.atomic(async (tx) => {
      const reservation = await tx.getReservation(reservationId);
      if (!reservation) {
        denial = `Treasury reservation not found: ${reservationId}`;
        return null;
      }
      if (reservation.status !== "ACTIVE") {
        denial = `Cannot extend reservation in state ${reservation.status}`;
        return null;
      }

      const account = await tx.getAccount(reservation.accountId);
      if (!account) {
        denial = `Treasury account not found: ${reservation.accountId}`;
        return null;
      }

      const additionalUsd = command.budgetEnvelope.maxCostUsd;
      const additionalCapacity = command.budgetEnvelope.maxCapacityUnits ?? 0;
      try {
        this.assertAdmissible(account, command.budgetEnvelope, command.priority, command.resourceRequest);
      } catch (error) {
        denial = error instanceof Error ? error.message : "Treasury extension denied";
        await tx.appendEvent(event(
          "SPEND_DENIED",
          account.accountId,
          { reason: denial, reservationId },
          { commandId: command.commandId, reservationId, missionId: reservation.missionId, amountUsd: additionalUsd, capacityUnits: additionalCapacity },
          now,
        ));
        return null;
      }

      if (account.availableUsd < additionalUsd || account.availableCapacityUnits < additionalCapacity) {
        denial = "Insufficient Treasury resources for reservation extension";
        await tx.appendEvent(event(
          "SPEND_DENIED",
          account.accountId,
          {
            reason: "INSUFFICIENT_EXTENSION_RESOURCES",
            availableUsd: account.availableUsd,
            requestedUsd: additionalUsd,
            availableCapacityUnits: account.availableCapacityUnits,
            requestedCapacityUnits: additionalCapacity,
          },
          { commandId: command.commandId, reservationId, missionId: reservation.missionId, amountUsd: additionalUsd, capacityUnits: additionalCapacity },
          now,
        ));
        return null;
      }

      const newExpiresAt = new Date(Math.min(
        new Date(reservation.expiresAt).getTime() + Math.max(new Date(command.expiresAt).getTime() - now.getTime(), 0),
        now.getTime() + this.policy.maxReservationTtlMs,
      )).toISOString();

      const next: TreasuryReservation = {
        ...reservation,
        reservedCostUsd: reservation.reservedCostUsd + additionalUsd,
        reservedCapacityUnits: reservation.reservedCapacityUnits + additionalCapacity,
        expiresAt: newExpiresAt,
        updatedAt: now.toISOString(),
      };

      await tx.putAccount({
        ...account,
        availableUsd: account.availableUsd - additionalUsd,
        reservedUsd: account.reservedUsd + additionalUsd,
        availableCapacityUnits: account.availableCapacityUnits - additionalCapacity,
        reservedCapacityUnits: account.reservedCapacityUnits + additionalCapacity,
        version: account.version + 1,
        updatedAt: now.toISOString(),
      });
      await tx.putReservation(next);
      await tx.appendEvent(event(
        "RESERVATION_EXTENDED",
        account.accountId,
        { addedUsd: additionalUsd, addedCapacityUnits: additionalCapacity, newExpiresAt },
        { commandId: command.commandId, reservationId, missionId: reservation.missionId, amountUsd: additionalUsd, capacityUnits: additionalCapacity },
        now,
      ));
      return next;
    });

    if (!updated) throw new TreasuryDeniedError(denial ?? "Treasury extension denied");
    return updated;
  }

  async validatePermit(
    permit: TreasuryEconomicPermit,
    context: import("./TreasuryContracts").TreasuryPermitContext,
  ): Promise<void> {
    const now = this.now();
    await this.ledger.atomic(async (tx) => {
      const reservation = await tx.getReservation(permit.reservationId);
      if (!reservation) {
        throw new TreasuryDeniedError(`Treasury reservation not found: ${permit.reservationId}`);
      }
      if (reservation.status !== "ACTIVE") {
        throw new TreasuryDeniedError(`Treasury permit is not active; reservation is ${reservation.status}`);
      }
      if (permit.status !== "ACTIVE") {
        throw new TreasuryDeniedError("Treasury permit is not active");
      }
      if (permit.reservationId !== reservation.reservationId ||
          permit.commandId !== reservation.commandId ||
          permit.overseerCommandId !== reservation.overseerCommandId ||
          permit.accountId !== reservation.accountId ||
          permit.missionId !== reservation.missionId ||
          permit.scopeDigest !== reservation.scopeDigest) {
        throw new TreasuryDeniedError("Treasury permit provenance does not match the reservation");
      }
      if (permit.scopeDigest !== context.scopeDigest ||
          permit.accountId !== context.accountId ||
          permit.missionId !== context.missionId ||
          (reservation.taskId && reservation.taskId !== context.jobId)) {
        throw new TreasuryDeniedError("Treasury permit is not bound to this execution scope");
      }
      const expiresAt = new Date(reservation.expiresAt).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) {
        throw new TreasuryDeniedError("Treasury permit has expired");
      }
      if (new Date(permit.expiresAt).getTime() !== expiresAt) {
        throw new TreasuryDeniedError("Treasury permit expiry does not match the reservation");
      }
      if (permit.maxCostUsd !== reservation.reservedCostUsd ||
          permit.maxCapacityUnits !== reservation.reservedCapacityUnits ||
          permit.maxRetries !== (reservation.maxRetries ?? 0)) {
        throw new TreasuryDeniedError("Treasury permit envelope does not match the reservation");
      }
    });
  }

  async settle(reservationId: string, consumption: TreasuryConsumption): Promise<TreasuryReservation> {
    const now = this.now();
    assertNonNegativeFinite(consumption.actualCostUsd, "actualCostUsd");
    assertNonNegativeFinite(consumption.actualCapacityUnits, "actualCapacityUnits");
    if (!consumption.executionEvidenceId) throw new TreasuryDeniedError("executionEvidenceId is required");
    if (consumption.reservationId !== reservationId) {
      throw new TreasuryDeniedError("Consumption reservationId does not match the target reservation");
    }

    let breach: string | null = null;
    const result = await this.ledger.atomic(async (tx) => {
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
          await tx.appendEvent(event(
            "TREASURY_FROZEN",
            account.accountId,
            {
              reason: "ACTUAL_CONSUMPTION_EXCEEDED_RESERVATION",
              reservationId,
            },
            { reservationId, commandId: reservation.commandId, missionId: reservation.missionId },
            now,
          ));
        }
        const next = { ...reservation, status: "BREACHED" as const, updatedAt: now.toISOString() };
        await tx.putReservation(next);
        await tx.appendEvent(event(
          "BUDGET_BREACH",
          reservation.accountId,
          {
            actualCostUsd: consumption.actualCostUsd,
            reservedCostUsd: reservation.reservedCostUsd,
            actualCapacityUnits: consumption.actualCapacityUnits,
            reservedCapacityUnits: reservation.reservedCapacityUnits,
            executionEvidenceId: consumption.executionEvidenceId,
          },
          {
            reservationId,
            commandId: reservation.commandId,
            missionId: reservation.missionId,
            amountUsd: consumption.actualCostUsd,
            capacityUnits: consumption.actualCapacityUnits,
          },
          now,
        ));
        breach = "Actual consumption exceeded reserved Treasury envelope; Treasury frozen";
        return next;
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
      const nextReservation: TreasuryReservation = {
        ...reservation,
        status: "SETTLED",
        updatedAt: now.toISOString(),
      };

      await tx.putAccount(nextAccount);
      await tx.putReservation(nextReservation);
      await tx.appendEvent(event(
        "RESOURCE_CONSUMED",
        reservation.accountId,
        {
          actualTokens: consumption.actualTokens,
          actualDurationMs: consumption.actualDurationMs,
          executionEvidenceId: consumption.executionEvidenceId,
          verified: consumption.verified,
        },
        {
          reservationId,
          commandId: reservation.commandId,
          missionId: reservation.missionId,
          amountUsd: consumption.actualCostUsd,
          capacityUnits: consumption.actualCapacityUnits,
        },
        now,
      ));
      await tx.appendEvent(event(
        "SPEND_RECONCILED",
        reservation.accountId,
        {
          reservedUsd: reservation.reservedCostUsd,
          actualCostUsd: consumption.actualCostUsd,
          releasedUsd: releaseUsd,
          verificationReceiptId: consumption.verificationReceiptId,
        },
        {
          reservationId,
          commandId: reservation.commandId,
          missionId: reservation.missionId,
          amountUsd: consumption.actualCostUsd,
          capacityUnits: consumption.actualCapacityUnits,
        },
        now,
      ));
      return nextReservation;
    });

    if (breach) throw new TreasuryDeniedError(breach);
    return result;
  }

  async reconcile(reservationId: string, consumption: TreasuryConsumption): Promise<TreasuryReservation> {
    return this.settle(reservationId, consumption);
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
      const nextReservation: TreasuryReservation = {
        ...reservation,
        status: reason === "EXPIRED" ? "EXPIRED" : "RELEASED",
        updatedAt: now.toISOString(),
      };

      await tx.putAccount(nextAccount);
      await tx.putReservation(nextReservation);
      await tx.appendEvent(event(
        reason === "EXPIRED" ? "RESERVATION_EXPIRED" : "RESERVATION_RELEASED",
        reservation.accountId,
        { reason },
        {
          reservationId,
          commandId: reservation.commandId,
          missionId: reservation.missionId,
          amountUsd: reservation.reservedCostUsd,
          capacityUnits: reservation.reservedCapacityUnits,
        },
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

  private async setMode(
    accountId: string,
    mode: "OPEN" | "FROZEN",
    command: TreasuryCommand,
    reason: string,
  ): Promise<TreasuryAccount> {
    const now = this.now();
    return this.ledger.atomic(async (tx) => {
      const account = await tx.getAccount(accountId);
      if (!account) throw new TreasuryDeniedError(`Treasury account not found: ${accountId}`);
      const next = { ...account, mode, version: account.version + 1, updatedAt: now.toISOString() };
      await tx.putAccount(next);
      await tx.appendEvent(event(
        mode === "FROZEN" ? "TREASURY_FROZEN" : "TREASURY_UNFROZEN",
        accountId,
        { reason, overseerCommandId: command.overseerCommandId },
        { commandId: command.commandId, missionId: command.missionId },
        now,
      ));
      return next;
    });
  }

  private validateAccount(account: TreasuryAccount): void {
    if (!account.accountId) throw new TreasuryDeniedError("Treasury accountId is required");
    assertNonNegativeFinite(account.budgetUsd, "budgetUsd");
    assertNonNegativeFinite(account.capacityUnits, "capacityUnits");
    if (account.availableUsd > account.budgetUsd || account.availableCapacityUnits > account.capacityUnits) {
      throw new TreasuryDeniedError("Treasury account available resources exceed configured budget/capacity");
    }
  }

  private validateCommand(command: TreasuryCommand): void {
    if (!command.commandId || !command.overseerCommandId) {
      throw new TreasuryDeniedError("Treasury commandId and overseerCommandId are required");
    }
    if (!command.issuer || command.issuer.authority !== "OVERSEER") {
      throw new TreasuryDeniedError("Treasurer accepts discretionary commands only from Overseer");
    }
    if (!command.issuer.issuerId) throw new TreasuryDeniedError("Overseer issuerId is required");
    if (command.issuer.issuerId !== command.overseerCommandId) {
      throw new TreasuryDeniedError(
        "Treasury issuer identity must match the originating Overseer command",
      );
    }
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

    if (!Array.isArray(command.resourceRequest) || command.resourceRequest.length === 0) {
      throw new TreasuryDeniedError("At least one Treasury resource request is required");
    }

    const envelope: TreasuryBudgetEnvelope = command.budgetEnvelope;
    assertNonNegativeFinite(envelope.maxCostUsd, "maxCostUsd");
    assertNonNegativeFinite(envelope.maxCapacityUnits ?? 0, "maxCapacityUnits");
    if (envelope.maxTokens !== undefined) assertNonNegativeFinite(envelope.maxTokens, "maxTokens");
    if (envelope.maxDurationMs !== undefined) assertNonNegativeFinite(envelope.maxDurationMs, "maxDurationMs");
    if (envelope.maxRetries !== undefined) assertNonNegativeFinite(envelope.maxRetries, "maxRetries");

    if (envelope.maxCostUsd > this.policy.maxSingleReservationUsd) {
      throw new TreasuryDeniedError(
        `Reservation exceeds Treasury single-reservation ceiling of $${this.policy.maxSingleReservationUsd}`,
      );
    }
    if ((envelope.maxCapacityUnits ?? 0) > this.policy.maxSingleCapacityUnits) {
      throw new TreasuryDeniedError("Reservation exceeds Treasury capacity ceiling");
    }
  }

  private assertAdmissible(
    account: TreasuryAccount,
    envelope: TreasuryBudgetEnvelope,
    priority: TreasuryPriority,
    requests: TreasuryCommand["resourceRequest"],
  ): void {
    if (account.mode === "FROZEN" || this.policy.mode === "FROZEN") {
      throw new TreasuryDeniedError("Treasury is FROZEN: no new discretionary reservations");
    }

    if (requests.some((request) => request.paidRoute === true) && !this.policy.allowPaidRoutes) {
      throw new TreasuryDeniedError("Paid route is disabled by Treasury policy");
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
