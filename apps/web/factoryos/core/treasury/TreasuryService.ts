/**
 * ShortForge / FactoryOS — Treasurer Service Facade
 *
 * Keep the public surface small. The kernel owns safety; this facade is the
 * integration seam for Overseer, ComputeRouter, model routing and verification.
 */

import type {
  TreasuryCommand,
  TreasuryConsumption,
  TreasuryEconomicPermit,
  TreasuryReservation,
  TreasuryReport,
  TreasuryQuote,
} from "./TreasuryContracts";
import { TreasuryKernel } from "./TreasuryKernel";

export class TreasuryService {
  constructor(private readonly kernel: TreasuryKernel) {}

  initialize(): Promise<void> {
    return this.kernel.initialize();
  }

  quote(command: TreasuryCommand): Promise<TreasuryQuote> {
    return this.kernel.quote(command);
  }

  ensureAccount(account: import("./TreasuryContracts").TreasuryAccount): Promise<import("./TreasuryContracts").TreasuryAccount> {
    return this.kernel.ensureAccount(account);
  }

  reserve(command: TreasuryCommand): Promise<{ reservation: TreasuryReservation; permit: TreasuryEconomicPermit }> {
    return this.kernel.reserve(command);
  }

  extend(reservationId: string, command: TreasuryCommand): Promise<TreasuryReservation> {
    return this.kernel.extend(reservationId, command);
  }

  settle(reservationId: string, consumption: TreasuryConsumption): Promise<TreasuryReservation> {
    return this.kernel.settle(reservationId, consumption);
  }

  reconcile(reservationId: string, consumption: TreasuryConsumption): Promise<TreasuryReservation> {
    return this.kernel.reconcile(reservationId, consumption);
  }

  release(reservationId: string, reason?: string): Promise<TreasuryReservation> {
    return this.kernel.release(reservationId, reason);
  }

  expireDueReservations(accountId?: string): Promise<number> {
    return this.kernel.expireDueReservations(accountId);
  }

  freeze(command: TreasuryCommand, reason: string): Promise<import("./TreasuryContracts").TreasuryAccount> {
    return this.kernel.freeze(command, reason);
  }

  unfreeze(command: TreasuryCommand, reason: string): Promise<import("./TreasuryContracts").TreasuryAccount> {
    return this.kernel.unfreeze(command, reason);
  }

  report(accountId: string, limit = 50): Promise<TreasuryReport> {
    return this.kernel.report(accountId, limit);
  }
}
