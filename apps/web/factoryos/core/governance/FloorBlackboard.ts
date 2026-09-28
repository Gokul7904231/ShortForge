import { randomUUID } from "node:crypto";
import type {
  BlackboardEntry,
  BlackboardEntryKind,
  CounselPacket,
  GovernanceActor,
} from "./FloorGovernanceContracts";
import type { FloorBlackboardJournal } from "./FloorBlackboardJournal";

export class FloorBlackboard {
  private readonly entries: BlackboardEntry[] = [];

  constructor(
    private readonly floorId: string,
    private readonly journal?: FloorBlackboardJournal
  ) {
    if (journal) {
      this.entries.push(...journal.load());
    }
  }

  append(
    kind: BlackboardEntryKind,
    author: GovernanceActor,
    trust: BlackboardEntry["trust"],
    content: Record<string, unknown>,
    evidenceRefs: readonly string[] = []
  ): BlackboardEntry {
    const entry: BlackboardEntry = {
      entryId: "bb_" + randomUUID().replace(/-/g, "").slice(0, 12),
      floorId: this.floorId,
      kind,
      author,
      trust,
      content: structuredClone(content),
      evidenceRefs: [...evidenceRefs],
      createdAt: new Date().toISOString(),
    };
    this.entries.push(entry);
    this.journal?.append(entry);
    return structuredClone(entry);
  }

  appendCounsel(packet: CounselPacket): BlackboardEntry {
    return this.append(
      "RECOMMENDATION",
      packet.ministerRole,
      "DERIVED",
      {
        counselId: packet.counselId,
        recommendation: packet.recommendation,
        uncertainty: packet.uncertainty,
        expectedOutcome: packet.expectedOutcome,
        urgency: packet.urgency,
        conflictsWith: [...packet.conflictsWith],
        constraints: [...packet.constraints],
        rejectionConditions: [...packet.rejectionConditions],
        provenance: packet.provenance,
      },
      packet.supportingEvidence
    );
  }

  getEntries(): BlackboardEntry[] {
    return structuredClone(this.entries);
  }

  getByKind(kind: BlackboardEntryKind): BlackboardEntry[] {
    return this.entries
      .filter((entry) => entry.kind === kind)
      .map((entry) => structuredClone(entry));
  }

  getVerifiedEvidence(): BlackboardEntry[] {
    return this.entries
      .filter((entry) => entry.kind === "EVIDENCE" && entry.trust === "VERIFIED")
      .map((entry) => structuredClone(entry));
  }

  getLatest(limit = 25): BlackboardEntry[] {
    return this.entries.slice(-limit).map((entry) => structuredClone(entry));
  }

  clearForTest(): void {
    this.entries.length = 0;
  }
}
