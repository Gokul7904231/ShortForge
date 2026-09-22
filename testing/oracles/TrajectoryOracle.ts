import type { MissionRun } from "../model/MissionRun";
import type { MissionSpecification } from "../contracts/mission.contract";
import type { Finding } from "../model/Finding";

export class TrajectoryOracle {
  public static evaluate(run: MissionRun, spec: MissionSpecification): Finding[] {
    const findings: Finding[] = [];

    // Extract ordered list of completed floors
    const floorEvents = run.events.filter((e) => e.action.type === "floor_complete");
    const executedFloorIds = floorEvents.map((e) => e.actor.floor || e.subjectId);
    const floorIndexMap = new Map<string, number>();

    executedFloorIds.forEach((id, idx) => {
      if (!floorIndexMap.has(id)) {
        floorIndexMap.set(id, idx);
      }
    });

    // 1. Verify all required stages executed
    for (const reqStage of spec.requiredStages) {
      if (!floorIndexMap.has(reqStage)) {
        findings.push({
          id: `find_trajectory_missing_stage_${reqStage}`,
          rule: "trajectory/required-stage-bypassed",
          severity: "critical",
          subject: reqStage,
          evidence: [`Stage '${reqStage}' was required but does not appear in executed stages: [${executedFloorIds.join(", ")}]`],
          expected: `Execution of required stage '${reqStage}'`,
          observed: `Stage '${reqStage}' bypassed`,
          rootCause: "DAG planner omitted stage or stage failed before execution",
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
    }

    // 2. Verify dependency constraints (order preservation)
    for (const dep of spec.dependencyConstraints) {
      const predIdx = floorIndexMap.get(dep.predecessor);
      const succIdx = floorIndexMap.get(dep.successor);

      if (predIdx !== undefined && succIdx !== undefined) {
        if (succIdx < predIdx) {
          findings.push({
            id: `find_trajectory_order_violation_${dep.predecessor}_${dep.successor}`,
            rule: "trajectory/illegal-execution-order",
            severity: "critical",
            subject: `${dep.predecessor} -> ${dep.successor}`,
            evidence: [`Successor '${dep.successor}' executed at step ${succIdx} before predecessor '${dep.predecessor}' at step ${predIdx}`],
            expected: `'${dep.predecessor}' must execute before '${dep.successor}'`,
            observed: `Inverted execution order: '${dep.successor}' preceded '${dep.predecessor}'`,
            rootCause: "Task DAG dependency graph violated ordering invariant",
            confidence: 1.0,
            supportedRepairs: [],
          });
        }
      }
    }

    return findings;
  }
}
