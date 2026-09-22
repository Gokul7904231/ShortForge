import type { MissionRun } from "../model/MissionRun";
import type { Finding } from "../model/Finding";
import { CANONICAL_FLOOR_CONTRACTS, type FloorId } from "../contracts/floor.contract";

export class ContractOracle {
  public static evaluate(run: MissionRun): Finding[] {
    const findings: Finding[] = [];

    const completedFloorEvents = run.events.filter((e) => e.action.type === "floor_complete");

    for (const evt of completedFloorEvents) {
      const floorId = (evt.actor.floor || evt.subjectId) as FloorId;
      const expectation = CANONICAL_FLOOR_CONTRACTS[floorId];

      if (!expectation) continue;

      const output = (evt.metadata as any)?.output;
      const isObj = typeof output === "object" && output !== null;
      const meta = typeof evt.metadata === "object" && evt.metadata !== null ? evt.metadata : {};

      for (const requiredKey of expectation.requiredMetadataKeys) {
        const hasKey = (isObj && requiredKey in output) || requiredKey in meta;
        if (!hasKey) {
          findings.push({
            id: `find_contract_missing_key_${floorId}_${requiredKey}`,
            rule: "contract/required-metadata-key-missing",
            severity: "error",
            subject: floorId,
            evidence: [`Floor ${floorId} output does not contain expected key '${requiredKey}'`, JSON.stringify(output)],
            expected: `Presence of '${requiredKey}' in floor output payload`,
            observed: `Key '${requiredKey}' missing`,
            rootCause: `Floor implementation did not populate contract field '${requiredKey}'`,
            confidence: 1.0,
            supportedRepairs: [],
          });
        }
      }
    }

    return findings;
  }
}
