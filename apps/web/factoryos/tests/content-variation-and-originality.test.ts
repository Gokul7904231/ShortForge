/**
 * FactoryOS — Content Variation, Content Genome & Originality Gate Verification
 * Proves the core product invariant: Same topic != same video.
 * Adheres strictly to: CLAIM <= EVIDENCE.
 */

import { describe, it, expect } from "vitest";
import {
  ContentGenome,
  computeGenomeHash,
  computeGenomeSimilarity,
} from "../core/creative/ContentGenome";
import { VariationPolicyEngine } from "../core/creative/VariationPolicyEngine";
import { OriginalityGate } from "../core/creative/OriginalityGate";

describe("FactoryOS Content Architecture — Content Variation & Originality Proof", () => {
  const variationEngine = VariationPolicyEngine.getInstance();
  const originalityGate = OriginalityGate.getInstance();

  const baseTopic = "Why airplane windows have tiny holes";

  // Variation A: Curiosity reveal
  const variantA: ContentGenome = {
    topic: baseTopic,
    thesis: "The tiny hole is a bleed valve balancing immense cabin pressure against freezing exterior atmosphere.",
    storyType: "curiosity-reveal",
    hookType: "curiosity-gap",
    narrativeStructure: "question-context-reveal-payoff",
    durationSeconds: 32,
    narrationSpeedWpm: 165,
    visualGrammar: "documentary-fast-cut",
    captionGrammar: "kinetic-emphasis",
    audioGrammar: "narration-plus-light-bed",
    factualClaims: [
      {
        claimId: "fact_01",
        claimText: "Aircraft cabins are pressurized to roughly 8,000 feet equivalent.",
        claimType: "VERIFIED_FACT",
        source: "FAA Cabin Safety Manual",
        retrievedAt: new Date().toISOString(),
        sourceReputationScore: 0.98,
        confidence: 0.99,
      },
    ],
    sourceSetHash: "src_hash_faa_01",
    scriptHash: "script_hash_variant_a",
    variationProfile: "profile_curiosity_01",
    originalityProfile: "orig_v1",
    contentGenomeVersion: 1,
  };

  // Variation B: Engineering breakdown (substantively different structure & thesis angle)
  const variantB: ContentGenome = {
    topic: baseTopic,
    thesis: "Airplane windows consist of three distinct acrylic panes; only the outer pane bears the 8-psi structural load.",
    storyType: "engineering-breakdown",
    hookType: "visual-anchor",
    narrativeStructure: "three-layer-breakdown",
    durationSeconds: 42,
    narrationSpeedWpm: 150,
    visualGrammar: "isometric-diagrammatic",
    captionGrammar: "phrase-chunked",
    audioGrammar: "ambient-documentary",
    factualClaims: [
      {
        claimId: "fact_02",
        claimText: "The middle pane acts as a fail-safe backup if the outer pane cracks.",
        claimType: "VERIFIED_FACT",
        source: "Boeing Structural Engineering Guide",
        retrievedAt: new Date().toISOString(),
        sourceReputationScore: 0.99,
        confidence: 0.99,
      },
    ],
    sourceSetHash: "src_hash_boeing_02",
    scriptHash: "script_hash_variant_b",
    variationProfile: "profile_engineering_02",
    originalityProfile: "orig_v1",
    contentGenomeVersion: 1,
  };

  // Variation C: Myth vs reality
  const variantC: ContentGenome = {
    topic: baseTopic,
    thesis: "Passengers fear the hole weakens the glass, but without it, the inner window would explode from moisture expansion.",
    storyType: "myth-vs-reality",
    hookType: "myth-busting",
    narrativeStructure: "myth-test-reality",
    durationSeconds: 36,
    narrationSpeedWpm: 175,
    visualGrammar: "split-screen-comparison",
    captionGrammar: "pop-single-word",
    audioGrammar: "high-tempo-synthwave",
    factualClaims: [
      {
        claimId: "fact_03",
        claimText: "The breather hole allows moisture to escape, preventing frost between panes.",
        claimType: "VERIFIED_FACT",
        source: "Airbus Maintenance Documentation",
        retrievedAt: new Date().toISOString(),
        sourceReputationScore: 0.97,
        confidence: 0.98,
      },
    ],
    sourceSetHash: "src_hash_airbus_03",
    scriptHash: "script_hash_variant_c",
    variationProfile: "profile_myth_03",
    originalityProfile: "orig_v1",
    contentGenomeVersion: 1,
  };

  it("1. Content Genome — computes deterministic fingerprints and detects material creative difference", () => {
    const hashA = computeGenomeHash(variantA);
    const hashB = computeGenomeHash(variantB);
    const hashC = computeGenomeHash(variantC);

    expect(hashA).toHaveLength(64);
    expect(hashB).toHaveLength(64);
    expect(hashC).toHaveLength(64);
    expect(hashA).not.toBe(hashB);
    expect(hashB).not.toBe(hashC);

    // Compute pairwise similarity
    const simAB = computeGenomeSimilarity(variantA, variantB);
    const simAC = computeGenomeSimilarity(variantA, variantC);
    const simBC = computeGenomeSimilarity(variantB, variantC);

    // Same topic, but completely different creative archetypes, visual grammars, and theses
    expect(simAB.compositeSimilarity).toBeLessThanOrEqual(0.60);
    expect(simAC.compositeSimilarity).toBeLessThanOrEqual(0.60);
    expect(simBC.compositeSimilarity).toBeLessThanOrEqual(0.60);

    expect(simAB.breakdown.storyTypeMatch).toBe(false);
    expect(simAB.breakdown.hookTypeMatch).toBe(false);
    expect(simAB.breakdown.structureMatch).toBe(false);
  });

  it("2. Variation Policy Engine — allows distinct variants while strictly blocking exact duplicates", () => {
    // A passes on empty history
    const decisionA = variationEngine.evaluateCandidate(variantA, []);
    expect(decisionA.outcome).toBe("PASS");

    // B passes with A in history (materially distinct profile)
    const decisionB = variationEngine.evaluateCandidate(variantB, [variantA]);
    expect(decisionB.outcome).toBe("PASS");
    expect(decisionB.maxSimilarity).toBeLessThanOrEqual(0.70);

    // C passes with A and B in history
    const decisionC = variationEngine.evaluateCandidate(variantC, [variantA, variantB]);
    expect(decisionC.outcome).toBe("PASS");

    // Exact script duplicate of A must be BLOCKED
    const duplicateOfA: ContentGenome = {
      ...variantA,
      thesis: "Slightly reworded summary",
    };
    const duplicateDecision = variationEngine.evaluateCandidate(duplicateOfA, [variantA, variantB]);
    expect(duplicateDecision.outcome).toBe("BLOCK");
    expect(duplicateDecision.reasons[0]).toContain("HARD_DUPLICATE");
  });

  it("3. Anti-Template Rule — detects template repetition and triggers REMAKE on clone content", () => {
    // Clone with only cosmetic duration change
    const cloneOfA: ContentGenome = {
      ...variantA,
      scriptHash: "script_hash_different_words_same_template",
      durationSeconds: 33, // Only 1s difference
    };

    const cloneDecision = variationEngine.evaluateCandidate(cloneOfA, [variantA]);
    expect(cloneDecision.outcome).toBe("REMAKE");
    expect(cloneDecision.maxSimilarity).toBeGreaterThan(0.85);
  });

  it("4. Originality Gate — blocks un-cleared rights and certifies pass on cleared, diverse shorts", () => {
    const decisionA = variationEngine.evaluateCandidate(variantA, []);

    // A with cleared rights passes
    const receiptPass = originalityGate.audit({
      genome: variantA,
      scriptText: "Full original script text for Short A...",
      variationDecision: decisionA,
      isRightsCleared: true,
    });
    expect(receiptPass.status).toBe("PASS");
    expect(receiptPass.scores.editorialDistinctness).toBeGreaterThanOrEqual(0.70);
    expect(receiptPass.scores.factualGroundedness).toBe(1.0);

    // B with uncleared rights is BLOCKED
    const receiptBlocked = originalityGate.audit({
      genome: variantA,
      scriptText: "Full script...",
      variationDecision: decisionA,
      isRightsCleared: false, // Uncleared rights
    });
    expect(receiptBlocked.status).toBe("BLOCK");
    expect(receiptBlocked.reasons[0]).toContain("RIGHTS_GATE_FAILED");
  });
});
