/**
 * ShortForge / FactoryOS — AER-Core training export boundary.
 *
 * Only explicitly validated AERDecisionTrainingRecord objects are exportable.
 * This exporter never promotes runtime/shadow predictions into gold labels.
 */

import type { AERDecisionTrainingRecord } from "./AERDecisionTrainingContract";
import { assertTrainingRecordEligible } from "./AERDecisionTrainingContract";

export class AERDecisionTrainingExporter {
  public static validate(
    records: readonly AERDecisionTrainingRecord[],
  ): readonly AERDecisionTrainingRecord[] {
    const ids = new Set<string>();
    for (const record of records) {
      assertTrainingRecordEligible(record);
      if (ids.has(record.exampleId)) {
        throw new Error(
          "Duplicate AER training example id: " + record.exampleId,
        );
      }
      ids.add(record.exampleId);
    }
    return records;
  }

  public static toJSONL(
    records: readonly AERDecisionTrainingRecord[],
  ): string {
    this.validate(records);
    return records
      .map((record) => JSON.stringify(record))
      .join("\n") + (records.length ? "\n" : "");
  }
}
