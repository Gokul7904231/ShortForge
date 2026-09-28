/**
 * FactoryOS Frontier v2 — Guardian Manager
 * Coordinates lifecycle and multi-guardian operation across all production floors.
 */

import { GuardianKernel } from "./GuardianKernel";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { WorldStateEngine } from "../worldstate/WorldStateEngine";
import type { CaseManager } from "../cases/CaseManager";
import { createDefaultFloorActionGraph } from "../governance/DefaultFloorActionGraph";
import { ProposalOnlyAscalonAdapter } from "../governance/AscalonGuardianAdapter";
import { DiskFloorBlackboardJournal } from "../governance/FloorBlackboardJournal";
import { FloorGovernanceCell } from "../governance/FloorGovernanceCell";
import { FloorCouncil, type FloorCouncilAdvisor } from "../governance/FloorCouncil";

export class GuardianManager {
  private guardians: Map<string, GuardianKernel> = new Map();
  private eventBus: DurableEventBus;
  private worldState: WorldStateEngine;
  private caseManager?: CaseManager;
  private isRunning: boolean = false;
  private governanceStoragePath?: string;

  constructor(
    eventBus: DurableEventBus,
    worldState: WorldStateEngine,
    caseManager?: CaseManager,
    governanceStoragePath?: string
  ) {
    this.eventBus = eventBus;
    this.worldState = worldState;
    this.caseManager = caseManager;
    this.governanceStoragePath = governanceStoragePath;

    this.registerDefaultGuardians();
  }

  private registerDefaultGuardians(): void {
    const floors = [
      { name: "Floor 01 Guardian (Strategy)", floorId: "floor01_strategy" },
      { name: "Floor 02 Guardian (Scripting)", floorId: "floor02_scripting" },
      { name: "Floor 03 Guardian (Asset Realization)", floorId: "floor03_asset_realization" },
      { name: "Floor 07 Guardian (Compliance)", floorId: "floor07_compliance" },
    ];

    for (const f of floors) {
      const guardian = new GuardianKernel(
        {
          name: f.name,
          floorId: f.floorId,
          auditIntervalMs: 2000,
          heartbeatIntervalMs: 3000,
        },
        this.worldState,
        this.eventBus,
        this.caseManager
      );

      const governanceCell = new FloorGovernanceCell({
        floorId: f.floorId,
        guardianId: `guardian_${f.floorId}`,
        actionGraph: createDefaultFloorActionGraph(),
        ascalon: new ProposalOnlyAscalonAdapter(async () => null),
        capabilities: [
          "floor.read",
          "floor.analyze",
          "floor.validate",
          "floor.authorize",
          "floor.execute",
          "floor.verify",
          "floor.close",
          "floor.quarantine",
          "floor.escalate",
          "floor.human_approval",
        ],
        blackboardJournal: new DiskFloorBlackboardJournal(this.governanceStoragePath, f.floorId),
         council: new FloorCouncil(),
         eventBus: this.eventBus,
      });

      governanceCell.setState("READY", "Guardian runtime attached");
      guardian.attachGovernanceCell(governanceCell);
      this.guardians.set(f.floorId, guardian);
    }
  }

  getGuardian(floorId: string): GuardianKernel | undefined {
    return this.guardians.get(floorId);
  }

  getAllGuardians(): GuardianKernel[] {
    return Array.from(this.guardians.values());
  }

  attachGovernanceAdvisor(advisor: FloorCouncilAdvisor): void {
    for (const guardian of this.guardians.values()) {
      guardian.getGovernanceCell()?.getCouncil()?.setAdvisor(advisor);
    }
  }

  async requestHealingClosureGrant(input: {
    incidentId: string;
    floorId: string;
    sessionId: string;
    evidenceRefs: readonly string[];
    bdaPass: boolean;
    auditorPass: boolean;
  }): Promise<{ authorized: boolean; grantId?: string; reason: string }> {
    const guardian = this.guardians.get(input.floorId);
    if (!guardian) {
      return { authorized: false, reason: `guardian_not_found:${input.floorId}` };
    }
    return guardian.authorizeHealingClosure({
      incidentId: input.incidentId,
      sessionId: input.sessionId,
      evidenceRefs: input.evidenceRefs,
      bdaPass: input.bdaPass,
      auditorPass: input.auditorPass,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const guardian of this.guardians.values()) {
      await guardian.start();
    }
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    for (const guardian of this.guardians.values()) {
      await guardian.stop();
    }
  }
}
