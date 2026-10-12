/**
 * ShortForge / FactoryOS — AER-Core shadow telemetry store.
 *
 * Shadow records are evidence for evaluation only. They are never authorization,
 * never production decisions, and never training labels by themselves.
 */

import type { AERCoreShadowRecord } from "./AERCoreShadowCoordinator";

export class AERCoreShadowLedger {
  private records: AERCoreShadowRecord[] = [];

  public record(record: AERCoreShadowRecord): void {
    this.records.push(record);
  }

  public getRecords(): readonly AERCoreShadowRecord[] {
    return this.records;
  }

  public getAgreementRate(): number {
    if (this.records.length === 0) return 0;
    const valid = this.records.filter((record) => record.aerCoreStatus === "VALID");
    if (valid.length === 0) return 0;
    return (
      valid.reduce((sum, record) => sum + record.agreementRate, 0) /
      valid.length
    );
  }

  public clear(): void {
    this.records = [];
  }
}
