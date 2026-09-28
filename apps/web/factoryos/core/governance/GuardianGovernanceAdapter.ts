import type { GuardianDecision } from "../guardian/GuardianContracts";
import type { FloorSnapshot } from "./FloorGovernanceContracts";
import type { GovernanceExecutionResult } from "./FloorGovernanceCell";
import { FloorGovernanceCell } from "./FloorGovernanceCell";

export class GuardianGovernanceAdapter {
  constructor(private readonly cell: FloorGovernanceCell) {}

  async executeDecision(
    decision: GuardianDecision,
    snapshot: FloorSnapshot,
    execute: (decision: GuardianDecision) => Promise<void>
  ): Promise<GovernanceExecutionResult> {
    return this.cell.executeGuardianDecision(
      decision,
      snapshot,
      () => execute(decision)
    );
  }
}
