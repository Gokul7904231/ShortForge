import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createDefaultNotebookRegistry } from "../factoryos/core/compute/notebooks";
import type { NotebookCredentialBundle } from "../factoryos/core/compute/notebooks/NotebookContracts";
import { ContentAddressedStore } from "../factoryos/core/compute/cas/ContentAddressedStore";
import { F07PhysicalArtifactVerifier } from "../factoryos/core/verification/youtube/physical/F07PhysicalArtifactVerifier";
import { VerificationEngine } from "../factoryos/core/verification/VerificationEngine";

function fail(message: string): never {
  throw new Error("LIGHTNING_PHYSICAL_PROOF_FAILED: " + message);
}

function credentials(): NotebookCredentialBundle {
  const required = [
    "LIGHTNING_USER_ID",
    "LIGHTNING_API_KEY",
    "LIGHTNING_TEAMSPACE",
  ];
  const values: Record<string, string> = {};
  for (const key of required) {
    const value = process.env[key];
    if (!value) fail("Missing required environment value: " + key);
    values[key] = value;
  }
  return values;
}

async function main() {
  const creds = credentials();
  const registry = createDefaultNotebookRegistry();
  const adapter = registry.get("LIGHTNING");
  if (!adapter) fail("Lightning adapter is not registered.");

  const validation = await adapter.validateCredentials(creds);
  if (!validation.authenticated) {
    fail("Lightning authentication failed: " + JSON.stringify(validation.evidence));
  }

  const root = process.cwd();
  const proofDir = path.join(root, "data", "lightning_live_proof");
  await fs.mkdir(proofDir, { recursive: true });

  const runId =
    "lightning-physical-" +
    Date.now() +
    "-" +
    randomUUID().slice(0, 8);
  const studioName =
    process.env.LIGHTNING_EXISTING_STUDIO?.trim() ||
    "shortforge-" + runId;
  const remoteArtifact =
    "shortforge-lightning-physical-proof-" + runId + ".mp4";
  const localArtifact = path.join(proofDir, runId + ".mp4");
  const remoteAbsolute = "$HOME/" + remoteArtifact;

  const renderCommand = [
    "command -v ffmpeg",
    "ffmpeg -hide_banner -loglevel error -y",
    "-f lavfi -i color=c=black:s=1080x1920:r=30:d=2",
    "-f lavfi -i sine=frequency=1000:sample_rate=48000:d=2",
    "-c:v libx264 -pix_fmt yuv420p -preset veryfast",
    "-c:a aac -b:a 128k -movflags +faststart",
    remoteAbsolute,
    "&& test -s " + remoteAbsolute,
    "&& ls -lh " + remoteAbsolute,
  ].join(" ");

  const provisioned = await adapter.provision(
    {
      idempotencyKey: runId,
      name: studioName,
      timeoutMs: 15 * 60 * 1000,
      gpuType:
        process.env.LIGHTNING_LIVE_MACHINE ||
        process.env.LIGHTNING_MACHINE ||
        "CPU",
    },
    creds,
  );

  let execution;
  try {
    execution = await adapter.execute(
      {
        runtime: provisioned.runtime,
        command: renderCommand,
        outputPath: remoteArtifact,
        artifactDestinationPath: localArtifact,
        timeoutMs: 12 * 60 * 1000,
      },
      creds,
    );
  } finally {
    await adapter.terminate(provisioned.runtime, creds);
  }

  if (
    execution.status !== "SUCCEEDED" ||
    execution.verificationLevel !== "PHYSICAL_ARTIFACT_VERIFIED" ||
    !execution.artifactPath ||
    !execution.artifactSha256 ||
    !execution.artifactByteLength
  ) {
    fail(
      "Lightning adapter did not return a physical artifact: " +
        JSON.stringify(execution),
    );
  }

  const localProbe = await VerificationEngine.probeMediaFile(
    execution.artifactPath,
  );

  if (
    !localProbe.fileExists ||
    localProbe.byteLength <= 0 ||
    !localProbe.hasFtypBox ||
    !localProbe.decodeSmokePassed ||
    localProbe.width !== 1080 ||
    localProbe.height !== 1920 ||
    localProbe.videoCodec !== "h264" ||
    localProbe.audioCodec !== "aac"
  ) {
    fail(
      "Independent local media probe failed: " +
        JSON.stringify(localProbe),
    );
  }

  const cas = ContentAddressedStore.getInstance();
  const casRef = await cas.putFile(
    execution.artifactPath,
    "lightning_physical_render_proof",
    "video/mp4",
    {
      provider: "LIGHTNING",
      teamspace: process.env.LIGHTNING_TEAMSPACE,
      studioName,
      remoteArtifact,
      sourceSha256: execution.artifactSha256,
      sourceByteLength: execution.artifactByteLength,
    },
  );

  if (
    casRef.sha256 !== execution.artifactSha256 ||
    casRef.byteLength !== execution.artifactByteLength
  ) {
    fail("CAS identity does not match independently downloaded artifact.");
  }

  const casIntegrity = await cas.verifyArtifactIntegrity(casRef);
  if (
    !casIntegrity.valid ||
    casIntegrity.actualSha256 !== execution.artifactSha256
  ) {
    fail(
      "CAS physical integrity verification failed: " +
        JSON.stringify(casIntegrity),
    );
  }

  const f07 = await F07PhysicalArtifactVerifier.verify({
    artifactSha256: casRef.sha256,
    artifactCasRef: "cas://" + casRef.sha256,
  });

  if (
    !f07.casBound ||
    !f07.sha256MatchesExpected ||
    f07.actualSha256 !== casRef.sha256 ||
    f07.byteLength !== casRef.byteLength ||
    !f07.measurements.decodeSmokePassed
  ) {
    fail(
      "F07 physical CAS verification failed: " +
        JSON.stringify(f07),
    );
  }

  const proof = {
    schemaVersion: "1.0",
    proofType: "LIGHTNING_PHYSICAL_MP4_RENDER",
    issue: 136,
    provider: "LIGHTNING",
    teamspace: process.env.LIGHTNING_TEAMSPACE,
    studioName,
    machine:
      process.env.LIGHTNING_LIVE_MACHINE ||
      process.env.LIGHTNING_MACHINE ||
      "CPU",
    remoteArtifact,
    localArtifact: execution.artifactPath,
    artifactSha256: execution.artifactSha256,
    artifactByteLength: execution.artifactByteLength,
    localProbe,
    cas: {
      artifactId: casRef.artifactId,
      sha256: casRef.sha256,
      byteLength: casRef.byteLength,
      uri: casRef.uri,
      integrityValid: casIntegrity.valid,
    },
    f07: {
      casBound: f07.casBound,
      sha256MatchesExpected: f07.sha256MatchesExpected,
      actualSha256: f07.actualSha256,
      byteLength: f07.byteLength,
      decodeSmokePassed: f07.measurements.decodeSmokePassed,
      source: f07.source,
    },
    evidence: [
      "Authenticated Lightning Studio lifecycle completed.",
      "Deterministic FFmpeg MP4 rendered in Lightning Studio.",
      "Artifact downloaded from Lightning through Studio.download_file().",
      "SHA-256 and byte length recomputed outside Lightning.",
      "Independent FFmpeg/ffprobe media probe passed.",
      "Artifact stored in ShortForge ContentAddressedStore.",
      "CAS physical integrity verification passed.",
      "F07PhysicalArtifactVerifier accepted the CAS-bound physical artifact.",
    ],
    generatedAt: new Date().toISOString(),
  };

  const proofPath = path.join(proofDir, runId + ".json");
  await fs.writeFile(proofPath, JSON.stringify(proof, null, 2), "utf8");
  console.log(JSON.stringify(proof, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
