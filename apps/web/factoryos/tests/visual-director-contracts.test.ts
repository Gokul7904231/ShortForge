import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { createStorybeat } from "../core/visual-director/Storybeat";
import { createVisualBrief, DEFAULT_SHORTS_SAFE_REGION } from "../core/visual-director/VisualBrief";
import { rankMediaCandidate } from "../core/visual-director/MediaCandidate";
import { createComponentSelection } from "../core/visual-director/ComponentSelection";
import { evaluateVisualJudge } from "../core/visual-director/VisualJudgeResult";
import { ComponentRegistry, ComponentDefinition } from "../core/visual-director/ComponentRegistry";

describe("ShortForge Visual Director Contracts & Component Registry (Iteration 2 Refinements)", () => {
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
        },
        semanticMatchScore: 1.0, // Perfect score
        entityMatchScore: 1.0,   // Perfect score
      });

      // Hard gate assertion: must be rejected regardless of perfect relevance scores
      expect(nonCommercialPerfectMatch.isAdmitted).toBe(false);
      expect(nonCommercialPerfectMatch.rankingSignals.compositeScore).toBe(0);
      expect(nonCommercialPerfectMatch.rejectionReason).toContain("Commercial use disallowed by license terms: CC-BY-NC-4.0");
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
  });

  describe("VisualJudge Automated Quality & Bounded Repair", () => {
    it("passes when all visual quality checks meet criteria", () => {
      const result = evaluateVisualJudge({
        id: "judge_01",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 8.5, // WCAG AAA
        alignmentDriftMs: 10, // within 33ms frame tolerance
        safeAreaPassed: true,
        entityRelevanceScore: 0.92,
      });

      expect(result.overallStatus).toBe("PASS");
      expect(result.checks.contrast.passed).toBe(true);
      expect(result.checks.alignment.passed).toBe(true);
      expect(result.repairAction).toBeUndefined();
    });

    it("triggers bounded repair when contrast or entity relevance fails, capped at 2 attempts", () => {
      const failedResult = evaluateVisualJudge({
        id: "judge_02",
        storybeatId: "beat_01",
        textClippingPassed: true,
        contrastRatio: 3.2,
        alignmentDriftMs: 10,
        safeAreaPassed: true,
        entityRelevanceScore: 0.40,
        currentAttempt: 1,
      });

      expect(failedResult.overallStatus).toBe("FAIL");
      expect(failedResult.repairAction).toBeDefined();
      expect(failedResult.repairAction?.maxAttempts).toBe(2);
      expect(failedResult.repairAction?.attemptIndex).toBe(2);
      expect(failedResult.repairAction?.type).toBe("SUBSTITUTE_ASSET");
    });
  });

  describe("ComponentRegistry Renderer-Profile Compatibility & Invariants", () => {
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
        qualificationStatus: "CONTRACT_TESTED",
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
        qualificationStatus: "CANDIDATE",
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

  describe("JSON Schema Validation for Manifests", () => {
    it("validates all four initial component manifests conform to component-schema.json", () => {
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
      const requiredFields: string[] = schema.required;

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

        // Verify every required schema field exists
        for (const field of requiredFields) {
          expect(manifest[field], `Manifest ${file} missing field '${field}'`).toBeDefined();
        }

        // Verify enum constraints
        expect(["container", "badge", "progress", "reveal", "cta", "transition", "icon"]).toContain(
          manifest.category
        );
        expect(schema.properties.qualificationStatus.enum).toContain(manifest.qualificationStatus);
        expect(manifest.qualificationStatus).toBe("CONTRACT_TESTED");

        // Verify supportedRendererProfiles
        expect(Array.isArray(manifest.supportedRendererProfiles)).toBe(true);
        expect(manifest.supportedRendererProfiles.length).toBeGreaterThan(0);
        expect(manifest.supportedRendererProfiles).toContain("shorts-native");

        // Verify dimension structure
        expect(Array.isArray(manifest.supportedDimensions)).toBe(true);
        expect(manifest.supportedDimensions[0].width).toBe(1080);
        expect(manifest.supportedDimensions[0].height).toBe(1920);
        expect(manifest.supportedDimensions[0].fps).toBe(30);

        // Verify commercial license
        expect(manifest.license.isCommercialAllowed).toBe(true);
      }
    });
  });
});
