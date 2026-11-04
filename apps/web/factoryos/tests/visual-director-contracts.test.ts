import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import Ajv from "ajv";
import { createStorybeat } from "../core/visual-director/Storybeat";
import { createVisualBrief, DEFAULT_SHORTS_SAFE_REGION } from "../core/visual-director/VisualBrief";
import { rankMediaCandidate } from "../core/visual-director/MediaCandidate";
import { createComponentSelection } from "../core/visual-director/ComponentSelection";
import { evaluateVisualJudge } from "../core/visual-director/VisualJudgeResult";
import { ComponentRegistry, ComponentDefinition } from "../core/visual-director/ComponentRegistry";

describe("ShortForge Visual Director Contracts & Component Registry (Iteration 2 Corrections)", () => {
  beforeEach(() => {
    ComponentRegistry.getInstance().clear();
  });

  describe("Storybeat Contract & Timing Mathematics", () => {
    it("snaps physical audio duration to frame ceiling at 30 fps", () => {
      // 3.42 seconds at 30 fps -> ceil(3.42 * 30) = ceil(102.6) = 103 frames
      const beat = createStorybeat({
        id: "beat_01",
        index: 0,
        role: "question",
        transcript: "What is the capital of Australia?",
        startSeconds: 0.0,
        durationSeconds: 3.42,
        fps: 30,
      });

      expect(beat.audioTiming.startFrame).toBe(0);
      expect(beat.audioTiming.frameCount).toBe(103);
      expect(beat.audioTiming.endFrame).toBe(103);
      expect(beat.audioTiming.hasSpokenAudio).toBe(true);
    });

    it("handles boundary condition: zero duration or silence scene enforces minimum 1 frame", () => {
      const silentBeat = createStorybeat({
        id: "beat_silent",
        index: 1,
        role: "think",
        transcript: "",
        startSeconds: 5.0,
        durationSeconds: 0.0,
        hasSpokenAudio: false,
        fps: 30,
      });

      expect(silentBeat.audioTiming.frameCount).toBe(1);
      expect(silentBeat.audioTiming.hasSpokenAudio).toBe(false);
      expect(silentBeat.audioTiming.endFrame).toBe(silentBeat.audioTiming.startFrame + 1);
    });

    it("correctly calculates fractional start offsets and end frames", () => {
      // 10.15s start -> round(304.5) = 305 frame; 5.0s think -> ceil(150) = 150 frames -> end frame = 455
      const thinkBeat = createStorybeat({
        id: "beat_think",
        index: 2,
        role: "think",
        transcript: "",
        startSeconds: 10.15,
        durationSeconds: 5.0,
        fps: 30,
      });

      expect(thinkBeat.audioTiming.startFrame).toBe(305);
      expect(thinkBeat.audioTiming.frameCount).toBe(150);
      expect(thinkBeat.audioTiming.endFrame).toBe(455);
    });

    it("runtime boundary: throws on negative startSeconds or durationSeconds", () => {
      expect(() =>
        createStorybeat({
          id: "beat_invalid",
          index: 0,
          role: "question",
          transcript: "Invalid",
          startSeconds: -1.5,
          durationSeconds: 2.0,
        })
      ).toThrow("Invalid startSeconds: -1.5. Must be a finite, non-negative number.");

      expect(() =>
        createStorybeat({
          id: "beat_invalid_dur",
          index: 0,
          role: "question",
          transcript: "Invalid",
          startSeconds: 0,
          durationSeconds: -0.5,
        })
      ).toThrow("Invalid durationSeconds: -0.5. Must be a finite, non-negative number.");
    });

    it("runtime boundary: throws on non-finite or non-positive fps", () => {
      expect(() =>
        createStorybeat({
          id: "beat_invalid_fps",
          index: 0,
          role: "question",
          transcript: "Invalid",
          startSeconds: 0,
          durationSeconds: 2.0,
          fps: 0,
        })
      ).toThrow("Invalid fps: 0. Must be a finite, positive number.");

      expect(() =>
        createStorybeat({
          id: "beat_nan_fps",
          index: 0,
          role: "question",
          transcript: "Invalid",
          startSeconds: 0,
          durationSeconds: 2.0,
          fps: NaN,
        })
      ).toThrow("Invalid fps: NaN. Must be a finite, positive number.");
    });
  });

  describe("VisualBrief Contract & Safe-Area Bounds", () => {
    it("generates multi-route search queries and defaults to vertical Shorts safe area", () => {
      const brief = createVisualBrief({
        id: "brief_01",
        storybeatId: "beat_01",
        focalSubject: "Canberra parliament house",
        primaryQuery: "Canberra Australian parliament aerial",
        categoryRoutes: ["geography", "architecture"],
      });

      expect(brief.focalSubject).toBe("Canberra parliament house");
      expect(brief.searchQueries.primaryQuery).toBe("Canberra Australian parliament aerial");
      expect(brief.searchQueries.categoryRoutes).toContain("geography");
      expect(brief.textSafeRegion.x).toBe(DEFAULT_SHORTS_SAFE_REGION.x);
      expect(brief.textSafeRegion.width).toBe(DEFAULT_SHORTS_SAFE_REGION.width);
      expect(brief.compositionTokens.contrastRequirement).toBe("WCAG_AAA");
    });
  });

  describe("MediaCandidate Multi-Signal Ranking & Licensing Hard Gate", () => {
    it("calculates multi-signal score and admits high-quality commercial assets", () => {
      const candidate = rankMediaCandidate({
        id: "cand_01",
        provider: "b2",
        assetUri: "b2://shortsfactory-assets/geography/canberra.jpg",
        mediaType: "image",
        width: 1080,
        height: 1920,
        sha256: "abc123def456",
        fileSizeBytes: 1450000,
        license: {
          spdxId: "CC-BY-4.0",
          isCommercialAllowed: true,
          attributionRequired: true,
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Canberra.jpg",
        },
        semanticMatchScore: 0.88,
        entityMatchScore: 0.95,
      });

      expect(candidate.isAdmitted).toBe(true);
      expect(candidate.rankingSignals.compositeScore).toBeGreaterThanOrEqual(0.60);
      expect(candidate.rejectionReason).toBeUndefined();
    });

    it("proves licensing is a hard gate: rejects asset with perfect 1.0 relevance when commercial use is disallowed", () => {
      const nonCommercialPerfectMatch = rankMediaCandidate({
        id: "cand_perfect_but_nc",
        provider: "openverse",
        assetUri: "https://example.com/perfect_mars_photo.jpg",
        mediaType: "image",
        width: 1080,
        height: 1920,
        sha256: "hash_perfect_match",
        fileSizeBytes: 1200000,
        license: {
          spdxId: "CC-BY-NC-4.0",
          isCommercialAllowed: false, // Disallowed!
          attributionRequired: true,
          sourceUrl: "https://example.com/mars.jpg",
        },
        semanticMatchScore: 1.0, // Perfect score
        entityMatchScore: 1.0,   // Perfect score
      });

      expect(nonCommercialPerfectMatch.isAdmitted).toBe(false);
      expect(nonCommercialPerfectMatch.rankingSignals.compositeScore).toBe(0);
      expect(nonCommercialPerfectMatch.rejectionReason).toContain("Commercial use disallowed or ambiguous rights: CC-BY-NC-4.0");
    });

    it("fails closed: rejects candidate when source URL is missing regardless of high relevance", () => {
      const missingSourceUrlCandidate = rankMediaCandidate({
        id: "cand_no_source",
        provider: "wikimedia",
        assetUri: "https://example.com/photo.jpg",
        mediaType: "image",
        width: 1080,
        height: 1920,
        sha256: "hash_no_source",
        fileSizeBytes: 500000,
        license: {
          spdxId: "CC0-1.0",
          isCommercialAllowed: true,
          attributionRequired: false,
          sourceUrl: "", // Empty source URL!
        },
        semanticMatchScore: 0.99,
        entityMatchScore: 0.99,
      });

      expect(missingSourceUrlCandidate.isAdmitted).toBe(false);
      expect(missingSourceUrlCandidate.rankingSignals.compositeScore).toBe(0);
      expect(missingSourceUrlCandidate.rejectionReason).toContain("Missing license provenance source URL");
    });

    it("fails closed: rejects candidate when SPDX identifier is missing, invalid, or UNKNOWN", () => {
      const invalidSpdxCandidate = rankMediaCandidate({
        id: "cand_unknown_spdx",
        provider: "local",
        assetUri: "local://assets/photo.jpg",
        mediaType: "image",
        width: 1080,
        height: 1920,
        sha256: "hash_unknown_spdx",
        fileSizeBytes: 500000,
        license: {
          spdxId: "UNKNOWN", // Invalid / UNKNOWN
          isCommercialAllowed: true,
          attributionRequired: false,
          sourceUrl: "https://example.com/source",
        },
        semanticMatchScore: 0.95,
        entityMatchScore: 0.95,
      });

      expect(invalidSpdxCandidate.isAdmitted).toBe(false);
      expect(invalidSpdxCandidate.rankingSignals.compositeScore).toBe(0);
      expect(invalidSpdxCandidate.rejectionReason).toContain("Missing or invalid SPDX license identifier");
    });

    it("fails closed: rejects candidate when commercial rights are ambiguous", () => {
      const ambiguousCandidate = rankMediaCandidate({
        id: "cand_ambiguous",
        provider: "openverse",
        assetUri: "https://example.com/ambiguous.jpg",
        mediaType: "image",
        width: 1080,
        height: 1920,
        sha256: "hash_ambiguous",
        fileSizeBytes: 500000,
        license: {
          spdxId: "Custom-Proprietary",
          isCommercialAllowed: false,
          attributionRequired: true,
          sourceUrl: "https://example.com/license",
        },
        semanticMatchScore: 0.99,
        entityMatchScore: 0.99,
      });

      expect(ambiguousCandidate.isAdmitted).toBe(false);
      expect(ambiguousCandidate.rankingSignals.compositeScore).toBe(0);
      expect(ambiguousCandidate.rejectionReason).toContain("Commercial use disallowed or ambiguous rights");
    });

    it("runtime boundary: throws on invalid ranking scores or invalid dimensions", () => {
      const validLicense = {
        spdxId: "Apache-2.0",
        isCommercialAllowed: true,
        attributionRequired: false,
        sourceUrl: "https://example.com",
      };

      expect(() =>
        rankMediaCandidate({
          id: "cand_bad_score",
          provider: "b2",
          assetUri: "b2://asset.jpg",
          mediaType: "image",
          width: 1080,
          height: 1920,
          sha256: "hash",
          fileSizeBytes: 1000,
          license: validLicense,
          semanticMatchScore: 1.5, // Invalid > 1.0
          entityMatchScore: 0.5,
        })
      ).toThrow("Invalid semanticMatchScore: 1.5");

      expect(() =>
        rankMediaCandidate({
          id: "cand_bad_dim",
          provider: "b2",
          assetUri: "b2://asset.jpg",
          mediaType: "image",
          width: 0, // Invalid width <= 0
          height: 1920,
          sha256: "hash",
          fileSizeBytes: 1000,
          license: validLicense,
          semanticMatchScore: 0.5,
          entityMatchScore: 0.5,
        })
      ).toThrow("Dimensions must be positive finite numbers");
    });
  });

  describe("ComponentSelection Contract", () => {
    it("binds storybeats to component IDs with explicit timing and justification", () => {
      const selection = createComponentSelection({
        id: "sel_01",
        storybeatId: "beat_01",
        componentId: "container.glass.panel.v1",
        role: "container",
        layerIndex: 1,
        startFrame: 0,
        endFrame: 103,
        justification: "Translucent glass container to enhance text legibility over photo backdrop",
      });

      expect(selection.componentId).toBe("container.glass.panel.v1");
      expect(selection.timing.startFrame).toBe(0);
      expect(selection.timing.endFrame).toBe(103);
      expect(selection.justification).toContain("Translucent glass");
    });

    it("runtime boundary: throws on invalid frame ranges or missing justification", () => {
      expect(() =>
        createComponentSelection({
          id: "sel_invalid_frames",
          storybeatId: "beat_01",
          componentId: "comp_01",
          role: "container",
          layerIndex: 0,
          startFrame: 100,
          endFrame: 50, // endFrame < startFrame!
          justification: "Valid justification",
        })
      ).toThrow("Invalid endFrame: 50. Must be an integer >= startFrame (100).");

      expect(() =>
        createComponentSelection({
          id: "sel_empty_just",
          storybeatId: "beat_01",
          componentId: "comp_01",
          role: "container",
          layerIndex: 0,
          startFrame: 0,
          endFrame: 50,
          justification: "   ", // Empty justification!
        })
      ).toThrow("requires a non-empty editorial justification");
    });
  });

  describe("VisualJudge Automated Quality & Bounded Repair", () => {
    it("passes when all visual quality checks meet criteria and supports injectable timestamp", () => {
      const fixedTimestamp = "2026-11-04T12:00:00.000Z";
      const result = evaluateVisualJudge({
        id: "judge_01",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 8.5, // WCAG AAA
        alignmentDriftMs: 10, // within 33ms frame tolerance
        safeAreaPassed: true,
        entityRelevanceScore: 0.92,
        evaluatedAt: fixedTimestamp,
      });

      expect(result.overallStatus).toBe("PASS");
      expect(result.evaluatedAt).toBe(fixedTimestamp);
      expect(result.checks.contrast.passed).toBe(true);
      expect(result.checks.alignment.passed).toBe(true);
      expect(result.repairAction).toBeUndefined();
    });

    it("maps entityRelevance failure specifically to SUBSTITUTE_ASSET", () => {
      const result = evaluateVisualJudge({
        id: "judge_entity_fail",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 7.5,
        alignmentDriftMs: 0,
        safeAreaPassed: true,
        entityRelevanceScore: 0.40, // Fails entity check (< 0.65)
        currentAttempt: 1,
      });

      expect(result.overallStatus).toBe("FAIL");
      expect(result.repairAction?.type).toBe("SUBSTITUTE_ASSET");
      expect(result.repairAction?.description).toContain("candidate media asset");
    });

    it("maps textClipping failure specifically to REWRAP_TEXT (not timing)", () => {
      const result = evaluateVisualJudge({
        id: "judge_clip_fail",
        storybeatId: "beat_01",
        textClippingPassed: false, // Fails clipping check!
        contrastRatio: 7.5,
        alignmentDriftMs: 0,
        safeAreaPassed: true,
        entityRelevanceScore: 0.90,
        currentAttempt: 1,
      });

      expect(result.overallStatus).toBe("FAIL");
      expect(result.repairAction?.type).toBe("REWRAP_TEXT");
      expect(result.repairAction?.type).not.toBe("ADJUST_TIMING");
      expect(result.repairAction?.proposedParameters.fontSizeScale).toBe(0.85);
    });

    it("maps contrast failure specifically to ADJUST_CONTRAST (not timing)", () => {
      const result = evaluateVisualJudge({
        id: "judge_contrast_fail",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 3.2, // Fails contrast (< 4.5)
        alignmentDriftMs: 0,
        safeAreaPassed: true,
        entityRelevanceScore: 0.90,
        currentAttempt: 1,
      });

      expect(result.overallStatus).toBe("FAIL");
      expect(result.repairAction?.type).toBe("ADJUST_CONTRAST");
      expect(result.repairAction?.type).not.toBe("ADJUST_TIMING");
      expect(result.repairAction?.proposedParameters.scrimOpacityDelta).toBe(0.25);
    });

    it("maps safeArea failure specifically to REPOSITION_SAFE_AREA (not timing)", () => {
      const result = evaluateVisualJudge({
        id: "judge_safe_fail",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 7.5,
        alignmentDriftMs: 0,
        safeAreaPassed: false, // Fails safe area!
        entityRelevanceScore: 0.90,
        currentAttempt: 1,
      });

      expect(result.overallStatus).toBe("FAIL");
      expect(result.repairAction?.type).toBe("REPOSITION_SAFE_AREA");
      expect(result.repairAction?.type).not.toBe("ADJUST_TIMING");
      expect(result.repairAction?.proposedParameters.safePaddingInsetPx).toBe(32);
    });

    it("maps audio-visual alignment drift specifically to ADJUST_TIMING", () => {
      const result = evaluateVisualJudge({
        id: "judge_align_fail",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 7.5,
        alignmentDriftMs: 85, // Drift > 33ms!
        safeAreaPassed: true,
        entityRelevanceScore: 0.90,
        currentAttempt: 1,
      });

      expect(result.overallStatus).toBe("FAIL");
      expect(result.repairAction?.type).toBe("ADJUST_TIMING");
      expect(result.repairAction?.proposedParameters.snapAudioCeiling).toBe(true);
    });

    it("enforces two-attempt bounded repair: attempt 2 yields no further repair (budget exhausted)", () => {
      const exhaustedResult = evaluateVisualJudge({
        id: "judge_exhausted",
        storybeatId: "beat_01",
        textClippingPassed: false,
        contrastRatio: 2.0,
        alignmentDriftMs: 0,
        safeAreaPassed: true,
        entityRelevanceScore: 0.90,
        currentAttempt: 2, // Reached maxAttempts!
      });

      expect(exhaustedResult.overallStatus).toBe("FAIL");
      expect(exhaustedResult.repairAction).toBeUndefined(); // Budget exhausted, no further repair
    });

    it("runtime boundary: throws on invalid currentAttempt (< 1 or non-integer)", () => {
      expect(() =>
        evaluateVisualJudge({
          id: "judge_bad_attempt",
          storybeatId: "beat_01",
          textClippingPassed: true,
          contrastRatio: 7.0,
          alignmentDriftMs: 0,
          safeAreaPassed: true,
          entityRelevanceScore: 0.9,
          currentAttempt: 0, // Invalid attempt < 1
        })
      ).toThrow("Invalid currentAttempt: 0. Must be an integer >= 1.");
    });
  });

  describe("ComponentRegistry Renderer-Profile Compatibility & Qualification Invariants", () => {
    it("registers components and filters by renderer profile", () => {
      const registry = ComponentRegistry.getInstance();

      const nativePill: ComponentDefinition = {
        id: "badge.category.pill.v1",
        name: "Category Pill Header",
        category: "badge",
        version: "1.0.0",
        contentHash: "hash123",
        type: "native_pillow",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }],
        inputSchema: { labelText: { type: "string" } },
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: ["shorts-native"],
        license: { spdxId: "Apache-2.0", author: "ShortForge", isCommercialAllowed: true },
        qualificationStatus: "QUALIFIED",
      };

      const remotionCard: ComponentDefinition = {
        id: "card.horizontal.remotion.v1",
        name: "Remotion 16:9 Card",
        category: "container",
        version: "1.0.0",
        contentHash: "hash456",
        type: "remotion_composition",
        supportedDimensions: [{ width: 1920, height: 1080, fps: 30 }],
        inputSchema: {},
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: ["remotion"],
        license: { spdxId: "MIT", author: "RenderComp", isCommercialAllowed: true },
        qualificationStatus: "QUALIFIED",
      };

      registry.register(nativePill);
      registry.register(remotionCard);

      expect(registry.isCompatibleWithProfile("badge.category.pill.v1", "shorts-native")).toBe(true);
      expect(registry.isCompatibleWithProfile("badge.category.pill.v1", "remotion")).toBe(false);

      expect(registry.isCompatibleWithProfile("card.horizontal.remotion.v1", "remotion")).toBe(true);
      expect(registry.isCompatibleWithProfile("card.horizontal.remotion.v1", "shorts-native")).toBe(false);

      // Querying for shorts-native returns only native-compatible components
      const shortsComponents = registry.list({ profile: "shorts-native" });
      expect(shortsComponents.map(c => c.id)).toContain("badge.category.pill.v1");
      expect(shortsComponents.map(c => c.id)).not.toContain("card.horizontal.remotion.v1");
    });

    it("prevents production selection of CANDIDATE, CONTRACT_TESTED, and DEPRECATED components", () => {
      const registry = ComponentRegistry.getInstance();

      const testedComp: ComponentDefinition = {
        id: "comp.tested.v1",
        name: "Contract Tested Component",
        category: "container",
        version: "1.0.0",
        contentHash: "hash_tested",
        type: "native_pillow",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }],
        inputSchema: {},
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: ["shorts-native"],
        license: { spdxId: "Apache-2.0", author: "ShortForge", isCommercialAllowed: true },
        qualificationStatus: "CONTRACT_TESTED", // Not QUALIFIED
      };

      registry.register(testedComp);

      // In production mode (default), CONTRACT_TESTED components are excluded from selection
      const prodComponents = registry.list({ profile: "shorts-native", mode: "production" });
      expect(prodComponents).toHaveLength(0);

      const prodMatch = registry.findBestMatch("container", 1080, 1920, 30, "shorts-native", "production");
      expect(prodMatch).toBeUndefined();

      // In test/preview mode, CONTRACT_TESTED components are admitted
      const testComponents = registry.list({ profile: "shorts-native", mode: "test" });
      expect(testComponents).toHaveLength(1);
      expect(testComponents[0].id).toBe("comp.tested.v1");

      const testMatch = registry.findBestMatch("container", 1080, 1920, 30, "shorts-native", "test");
      expect(testMatch?.id).toBe("comp.tested.v1");
    });

    it("prevents 'reference-only' from being queried or selected as an executable production profile", () => {
      const registry = ComponentRegistry.getInstance();

      const refComp: ComponentDefinition = {
        id: "comp.ref.v1",
        name: "Reference Component",
        category: "transition",
        version: "1.0.0",
        contentHash: "hash_ref",
        type: "motion_recipe",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }],
        inputSchema: {},
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: ["reference-only"],
        license: { spdxId: "MIT", author: "RenderComp", isCommercialAllowed: true },
        qualificationStatus: "QUALIFIED",
      };

      registry.register(refComp);

      expect(() =>
        registry.list({ profile: "reference-only", mode: "production" })
      ).toThrow("cannot be queried for executable production pipelines");

      expect(() =>
        registry.findBestMatch("transition", 1080, 1920, 30, "reference-only", "production")
      ).toThrow("cannot be selected for executable production rendering");

      // In test mode, reference profile queries are permitted
      const testList = registry.list({ profile: "reference-only", mode: "test" });
      expect(testList).toHaveLength(1);
    });

    it("verifies FPS as well as width and height in findBestMatch", () => {
      const registry = ComponentRegistry.getInstance();

      const comp30fps: ComponentDefinition = {
        id: "comp.30fps.v1",
        name: "30 FPS Component",
        category: "progress",
        version: "1.0.0",
        contentHash: "hash_30",
        type: "native_pillow",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }], // Only 30fps
        inputSchema: {},
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: ["shorts-native"],
        license: { spdxId: "Apache-2.0", author: "ShortForge", isCommercialAllowed: true },
        qualificationStatus: "QUALIFIED",
      };

      registry.register(comp30fps);

      // Matches 30fps
      const match30 = registry.findBestMatch("progress", 1080, 1920, 30, "shorts-native", "production");
      expect(match30?.id).toBe("comp.30fps.v1");

      // Fails to match when requesting 60fps
      const match60 = registry.findBestMatch("progress", 1080, 1920, 60, "shorts-native", "production");
      expect(match60).toBeUndefined();
    });

    it("throws and rejects duplicate component registrations", () => {
      const registry = ComponentRegistry.getInstance();

      const comp: ComponentDefinition = {
        id: "duplicate.id.v1",
        name: "First Instance",
        category: "container",
        version: "1.0.0",
        contentHash: "hash1",
        type: "native_pillow",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }],
        inputSchema: {},
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: ["shorts-native"],
        license: { spdxId: "Apache-2.0", author: "ShortForge", isCommercialAllowed: true },
        qualificationStatus: "CANDIDATE",
      };

      registry.register(comp);

      expect(() => registry.register({ ...comp, name: "Second Instance" })).toThrow(
        "Duplicate registration: component 'duplicate.id.v1' is already registered."
      );
    });

    it("throws on invalid input: missing required metadata, dimensions, or profiles", () => {
      const registry = ComponentRegistry.getInstance();

      const invalidNoProfiles: any = {
        id: "invalid.v1",
        name: "Invalid Component",
        category: "container",
        version: "1.0.0",
        contentHash: "hash1",
        type: "native_pillow",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }],
        inputSchema: {},
        timingBehavior: { allowsTransition: true },
        supportedRendererProfiles: [], // Empty!
        license: { spdxId: "Apache-2.0", author: "ShortForge", isCommercialAllowed: true },
        qualificationStatus: "CANDIDATE",
      };

      expect(() => registry.register(invalidNoProfiles)).toThrow(
        "must declare at least one supported renderer profile"
      );
    });
  });

  describe("Exhaustive JSON Schema Validation with Ajv (Draft-07)", () => {
    it("validates all four initial component manifests strictly against component-schema.json using Ajv", () => {
      // Find assets directory relative to either repo root or apps/web cwd
      let manifestsDir = path.resolve(process.cwd(), "assets", "component-manifests");
      if (!fs.existsSync(manifestsDir)) {
        manifestsDir = path.resolve(process.cwd(), "..", "..", "assets", "component-manifests");
      }
      if (!fs.existsSync(manifestsDir)) {
        manifestsDir = path.resolve(__dirname, "../../../../assets/component-manifests");
      }
      expect(fs.existsSync(manifestsDir)).toBe(true);

      const schemaPath = path.join(manifestsDir, "component-schema.json");
      expect(fs.existsSync(schemaPath)).toBe(true);

      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

      // Instantiate Ajv Draft-07 validator
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      expect(validate).toBeDefined();

      const manifestFiles = [
        "card-glass-panel.json",
        "badge-category-pill.json",
        "progress-timer-bar.json",
        "answer-emerald-punch.json",
      ];

      for (const file of manifestFiles) {
        const filePath = path.join(manifestsDir, file);
        expect(fs.existsSync(filePath)).toBe(true);

        const manifest = JSON.parse(fs.readFileSync(filePath, "utf-8"));

        const isValid = validate(manifest);
        expect(
          isValid,
          `Manifest ${file} failed Ajv JSON schema validation: ${JSON.stringify(validate.errors)}`
        ).toBe(true);
        expect(validate.errors).toBeNull();

        // Affirm manifests are CONTRACT_TESTED per governance
        expect(manifest.qualificationStatus).toBe("CONTRACT_TESTED");
      }
    });

    it("verifies that invalid component manifest payloads fail Ajv schema validation", () => {
      let manifestsDir = path.resolve(process.cwd(), "assets", "component-manifests");
      if (!fs.existsSync(manifestsDir)) {
        manifestsDir = path.resolve(process.cwd(), "..", "..", "assets", "component-manifests");
      }
      const schemaPath = path.join(manifestsDir, "component-schema.json");
      const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);

      // Missing required 'contentHash' and invalid 'qualificationStatus'
      const invalidPayload = {
        id: "bad.payload.v1",
        name: "Bad Payload",
        category: "container",
        version: "1.0.0",
        type: "native_pillow",
        supportedDimensions: [{ width: 1080, height: 1920, fps: 30 }],
        inputSchema: {},
        supportedRendererProfiles: ["shorts-native"],
        license: { spdxId: "Apache-2.0", author: "Test", isCommercialAllowed: true },
        qualificationStatus: "INVALID_STATUS", // Not in enum
      };

      const isValid = validate(invalidPayload);
      expect(isValid).toBe(false);
      expect(validate.errors).toBeDefined();
      expect(validate.errors?.length).toBeGreaterThan(0);
    });
  });

  describe("Source-License Integrity & Cryptographic Hash Verification", () => {
    it("verifies cryptographic SHA-256 hashes of all referenced license files against SOURCES.lock.json", () => {
      let sourcesDir = path.resolve(process.cwd(), "assets", "component-sources");
      if (!fs.existsSync(sourcesDir)) {
        sourcesDir = path.resolve(process.cwd(), "..", "..", "assets", "component-sources");
      }
      expect(fs.existsSync(sourcesDir)).toBe(true);

      const lockPath = path.join(sourcesDir, "SOURCES.lock.json");
      expect(fs.existsSync(lockPath)).toBe(true);

      const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
      expect(lock.sources).toBeDefined();

      for (const [sourceKey, sourceEntry] of Object.entries<any>(lock.sources)) {
        // Resolve path relative to repo root
        let licenseFilePath = path.resolve(process.cwd(), sourceEntry.licenseFile);
        if (!fs.existsSync(licenseFilePath)) {
          licenseFilePath = path.resolve(process.cwd(), "..", "..", sourceEntry.licenseFile);
        }
        expect(fs.existsSync(licenseFilePath), `License file missing for ${sourceKey}: ${sourceEntry.licenseFile}`).toBe(true);

        const content = fs.readFileSync(licenseFilePath);
        const actualSha256 = crypto.createHash("sha256").update(content).digest("hex");

        expect(
          actualSha256,
          `SHA-256 mismatch for source '${sourceKey}'. Lock: ${sourceEntry.licenseSha256}, Actual: ${actualSha256}`
        ).toBe(sourceEntry.licenseSha256);
      }
    });
  });
});
