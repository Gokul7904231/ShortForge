import { describe, expect, it } from "vitest";
import { ContextFabric } from "../../core/cognitive/context/ContextFabric";
import type {
  CLMContextProposal,
  CLMContextProposalPort,
  ContextProposalBudget,
} from "../../core/cognitive/context/ContextFabricContracts";
import type { ContextReference } from "../../core/cognitive/CognitiveContracts";

function ref(id: string, tokenCount = 40): ContextReference {
  return {
    refId: id,
    type: "DOCUMENT",
    title: "Reference " + id,
    summary: "Summary for " + id,
    tokenCount,
    timestamp: "2026-10-06T08:00:00.000Z",
    confidence: 0.9,
    source: "test",
    tags: ["clm-shadow"],
    isDereferenced: false,
  };
}

const budget: ContextProposalBudget = {
  maxEdits: 4,
  maxContextGrowthTokens: 200,
  maxLatencyMs: 5000,
  maxCost: 0.5,
};

function makeProposal(
  fabric: ContextFabric,
  overrides: Partial<CLMContextProposal> = {},
): CLMContextProposal {
  const workspace = fabric.getWorkspace();
  const proposal: CLMContextProposal = {
    schemaVersion: "1.0.0",
    proposalId: "clm_proposal_01",
    workspaceId: workspace.workspaceId,
    missionId: workspace.missionId,
    taskId: workspace.taskId,
    baseVersion: workspace.version,
    generatedAt: "2026-10-06T08:01:00.000Z",
    provenance: {
      source: "CLM_SHADOW",
      modelRef: "clm-shadow-test",
      modelVersion: "test-1",
      traceId: "trace-clm-01",
      policyVersion: "context-policy-v1",
    },
    authorityScope: "WORKING_CONTEXT_ONLY",
    confidence: 0.8,
    estimatedCost: 0.05,
    estimatedContextGrowthTokens: 40,
    budget,
    edits: [
      {
        editId: "clm_edit_01",
        baseVersion: workspace.version,
        actor: "CLM_PROPOSAL",
        type: "RETAIN",
        reference: ref("b", 40),
        reason: "retain relevant evidence",
      },
    ],
    rationale: "Shadow proposal keeps a relevant evidence reference available.",
    proposalFingerprint: "",
    ...overrides,
  };

  return {
    ...proposal,
    proposalFingerprint: fabric.fingerprintCLMShadowProposal(proposal),
  };
}

describe("Context Fabric Wave F — CLM shadow proposals", () => {
  it("accepts a valid proposal without mutating or committing context", async () => {
    const fabric = new ContextFabric({
      workspaceId: "ctxws_clm_shadow",
      missionId: "mission_clm",
      taskId: "task_clm",
    });

    fabric.applyEdits([
      {
        editId: "seed_01",
        baseVersion: 0,
        actor: "SYSTEM",
        type: "RETAIN",
        reference: ref("a"),
        reason: "seed current workspace",
      },
    ]);

    const before = fabric.getWorkspace();
    const port: CLMContextProposalPort = {
      modelRef: "clm-shadow-test",
      async propose() {
        return makeProposal(fabric);
      },
    };

    const result = await fabric.proposeCLMShadowEdits(port, {
      traceId: "trace-clm-01",
      policyVersion: "context-policy-v1",
      candidateReferences: [ref("b")],
      budget,
    });

    expect(result.validation.valid).toBe(true);
    expect(result.validation.errors).toEqual([]);
    expect(result.contextMutated).toBe(false);
    expect(result.durableCommitAttempted).toBe(false);
    expect(fabric.getWorkspace()).toEqual(before);
  });

  it("fails closed on stale, non-CLM, duplicate, and over-budget edits", () => {
    const fabric = new ContextFabric({
      workspaceId: "ctxws_clm_invalid",
      missionId: "mission_clm",
      taskId: "task_clm",
    });
    fabric.applyEdits([
      {
        editId: "seed_01",
        baseVersion: 0,
        actor: "SYSTEM",
        type: "RETAIN",
        reference: ref("a"),
        reason: "seed current workspace",
      },
    ]);

    const proposal = makeProposal(fabric, {
      edits: [
        {
          editId: "dup",
          baseVersion: 0,
          actor: "SYSTEM",
          type: "RETAIN",
          reference: ref("b"),
          reason: "wrong actor and stale version",
        },
        {
          editId: "dup",
          baseVersion: 0,
          actor: "CLM_PROPOSAL",
          type: "OPTIMIZE",
          reason: "duplicate id",
        },
        {
          editId: "over",
          baseVersion: 0,
          actor: "CLM_PROPOSAL",
          type: "REORDER",
          priorityType: "DOCUMENT",
          reason: "third edit",
        },
        {
          editId: "over-budget",
          baseVersion: 0,
          actor: "CLM_PROPOSAL",
          type: "OPTIMIZE",
          reason: "fourth edit",
        },
        {
          editId: "fifth",
          baseVersion: 0,
          actor: "CLM_PROPOSAL",
          type: "OPTIMIZE",
          reason: "exceeds max edits",
        },
      ],
    });

    const validation = fabric.validateCLMShadowProposal(
      proposal,
      fabric.getWorkspace(),
      { ...budget, maxEdits: 4 },
      "clm-shadow-test",
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("stale baseVersion"),
        expect.stringContaining("actor CLM_PROPOSAL"),
        expect.stringContaining("duplicate editId"),
        expect.stringContaining("edit count exceeds"),
      ]),
    );
    expect(fabric.getWorkspace().version).toBe(1);
    expect(fabric.getWorkspace().activeReferences.map((item) => item.refId)).toEqual(["a"]);
  });

  it("rejects tampered fingerprints and forbidden authority markers", () => {
    const fabric = new ContextFabric({
      workspaceId: "ctxws_clm_tamper",
      missionId: "mission_clm",
      taskId: "task_clm",
    });

    const proposal = {
      ...makeProposal(fabric),
      proposalFingerprint: "0".repeat(64),
      treasuryAdmission: "approved",
    } as CLMContextProposal & { treasuryAdmission?: string };

    const validation = fabric.validateCLMShadowProposal(
      proposal,
      fabric.getWorkspace(),
      budget,
      "clm-shadow-test",
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(
      expect.arrayContaining([
        "forbidden authority marker treasuryAdmission",
        "proposalFingerprint mismatch",
      ]),
    );
  });

  it("rejects a proposal whose budget differs from the caller budget", async () => {
    const fabric = new ContextFabric({
      workspaceId: "ctxws_clm_budget",
      missionId: "mission_clm",
      taskId: "task_clm",
    });

    const port: CLMContextProposalPort = {
      modelRef: "clm-shadow-test",
      async propose() {
        return makeProposal(fabric, {
          budget: { ...budget, maxCost: 999 },
        });
      },
    };

    const result = await fabric.proposeCLMShadowEdits(port, {
      traceId: "trace-clm-budget",
      policyVersion: "context-policy-v1",
      candidateReferences: [],
      budget,
    });

    expect(result.validation.valid).toBe(false);
    expect(result.validation.errors).toContain("proposal budget differs from the caller budget");
    expect(fabric.getWorkspace().version).toBe(0);
  });
});
