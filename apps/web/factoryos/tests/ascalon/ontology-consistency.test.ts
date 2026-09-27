/**
 * Project Ascalon — Runtime/Ontology Cross-Floor Consistency
 *
 * This suite prevents semantic drift between executable floor contracts and
 * the machine-readable ontology consumed by Ascalon trajectory generation.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { FloorRegistry } from "../../core/hierarchy/FloorRegistry";
import { KNOWN_CAPABILITIES } from "../../../../training/ascalon/validators/AscalonTrajectoryValidator";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(TEST_DIR, "../../../../..");

function readJson(relativePath: string): any {
  return JSON.parse(
    readFileSync(resolve(ROOT, relativePath), "utf8")
  );
}

describe("Project Ascalon: Runtime ↔ Ontology Consistency", () => {
  it("keeps F04 runtime identity aligned with canonical ontology", () => {
    const runtime = FloorRegistry.getFloor("floor04_media_synthesis");
    const ontology = readJson("training/ascalon/ontology/floors.json");
    const f04 = ontology.floors.find((floor: any) => floor.floorId === "floor04_media_synthesis");

    expect(f04).toBeDefined();
    expect(runtime.canonicalName).toBe(f04.canonicalName);
    expect(runtime.category).toBe(f04.category);
    expect(f04.expectedInputs).toContain("floor03Handoff");
    expect(f04.expectedOutputs).toContain("mediaPackage");
    expect(f04.requiredMetadataKeys).toContain("sourceAssetPlanFingerprint");
    expect(f04.requiredMetadataKeys).toContain("provenanceHash");
  });

  it("keeps F04 capabilities bound to an explicit operational worker", () => {
    const capabilities = readJson("training/ascalon/ontology/capabilities.json");
    const agents = readJson("training/ascalon/ontology/agents.json");

    const f04Caps = capabilities.capabilities.filter(
      (cap: any) => cap.floorId === "floor04_media_synthesis"
    );
    const mediaSynthesizer = agents.agents.find(
      (agent: any) => agent.canonicalRole === "MEDIA_SYNTHESIZER"
    );

    expect(mediaSynthesizer).toBeDefined();
    expect(mediaSynthesizer.assignedFloor).toBe("floor04_media_synthesis");

    for (const cap of f04Caps) {
      if (cap.name.includes("Voice") || cap.name.includes("Temporal") || cap.name.includes("Visual")) {
        expect(cap.allowedRoles).toContain("MEDIA_SYNTHESIZER");
        expect(cap.requiresGuardianGate).toBe(true);
      }
    }
  });

  it("keeps every ontology capability in the trajectory validator allowlist", () => {
    const capabilities = readJson("training/ascalon/ontology/capabilities.json");

    for (const cap of capabilities.capabilities) {
      expect(KNOWN_CAPABILITIES).toContain(cap.capabilityId);
    }
  });

  it("prevents the old voice-only F04 identity from returning to the ontology", () => {
    const ontology = readJson("training/ascalon/ontology/floors.json");
    const f04 = ontology.floors.find((floor: any) => floor.floorId === "floor04_media_synthesis");

    expect(f04.category).toBe("MEDIA");
    expect(f04.canonicalName).toBe("Media Synthesis & Provider Execution");
    expect(f04.shortName).toBe("Media Synthesis");
  });
});
