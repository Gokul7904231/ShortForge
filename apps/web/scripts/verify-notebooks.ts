import {
  createDefaultNotebookRegistry,
  type NotebookCredentialBundle,
  type NotebookProviderType,
} from "../factoryos/core/compute/notebooks";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const LIVE_PROVIDERS: NotebookProviderType[] = ["KAGGLE", "COLAB", "LIGHTNING"];

function credentialsFor(provider: NotebookProviderType): NotebookCredentialBundle {
  const keysByProvider: Record<NotebookProviderType, string[]> = {
    KAGGLE: ["KAGGLE_USERNAME", "KAGGLE_KEY"],
    COLAB: ["COLAB_ACCESS_TOKEN"],
    PAPERSPACE: ["PAPERSPACE_API_KEY"],
    LIGHTNING: ["LIGHTNING_USER_ID", "LIGHTNING_API_KEY"],
    HF_ZEROGPU: ["HF_ZEROGPU_SPACE", "HF_ZEROGPU_API_NAME", "HF_TOKEN"],
  };
  const credentials: Record<string, string> = {};
  for (const key of keysByProvider[provider]) {
    if (process.env[key]) credentials[key] = process.env[key]!;
  }
  return credentials;
}

async function runLive(provider: NotebookProviderType) {
  if (!LIVE_PROVIDERS.includes(provider)) {
    throw new Error("Live notebook smoke supports KAGGLE, COLAB, and LIGHTNING.");
  }

  const registry = createDefaultNotebookRegistry();
  const adapter = registry.get(provider);
  if (!adapter) throw new Error("Notebook provider not registered: " + provider);

  const credentials = credentialsFor(provider);
  const validation = await adapter.validateCredentials(credentials);
  console.log(JSON.stringify({ provider, validation }, null, 2));

  if (!validation.authenticated) {
    throw new Error(
      "Live provider authentication failed for " +
        provider +
        ". Missing: " +
        validation.missingKeys.join(", "),
    );
  }

  if (provider === "KAGGLE") {
    // Kaggle GPU notebook provisioning can spend several minutes in queue
    // before the worker reaches RUNNING. Keep the live proof bounded, but do not
    // turn normal hosted-capacity latency into a false failure.
    const timeoutMs = Number(process.env.NOTEBOOK_LIVE_TIMEOUT_MS || 1200000);
    const outputPath = "/kaggle/working/shortforge-live-notebook-probe.mp4";
    const artifactDir = path.join(
      process.env.GITHUB_WORKSPACE || process.cwd(),
      "artifacts",
      "kaggle-live",
    );
    await fs.mkdir(artifactDir, { recursive: true });
    const persistedArtifact = path.join(
      artifactDir,
      "shortforge-live-notebook-probe.mp4",
    );

    const result = await adapter.execute(
      {
        artifactDestinationPath: persistedArtifact,
        command:
          "ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=black:s=320x180:d=1 -an -c:v libx264 -pix_fmt yuv420p " +
          outputPath,
        timeoutMs,
        outputPath,
        provision: {
          idempotencyKey: "shortforge-live-kaggle-" + Date.now(),
          name: "ShortForge Live Notebook Probe",
          gpuType: process.env.KAGGLE_LIVE_GPU === "1" ? "NvidiaTeslaT4" : undefined,
          timeoutMs,
        },
      },
      credentials,
    );

    if (
      result.status === "SUCCEEDED" &&
      result.verificationLevel === "PHYSICAL_ARTIFACT_VERIFIED" &&
      result.artifactPath
    ) {
      const persistedStat = await fs.stat(result.artifactPath);
      console.log(
        JSON.stringify(
          {
            persistedArtifactPath: result.artifactPath,
            persistedArtifactByteLength: persistedStat.size,
          },
          null,
          2,
        ),
      );
    }

    console.log(JSON.stringify({ provider, liveResult: result }, null, 2));

    if (
      result.status !== "SUCCEEDED" ||
      result.verificationLevel !== "PHYSICAL_ARTIFACT_VERIFIED" ||
      !result.artifactSha256 ||
      !result.artifactByteLength ||
      result.artifactByteLength < 1024
    ) {
      throw new Error("Kaggle live physical-artifact probe did not pass.");
    }
    return;
  }

  if (provider === "COLAB") {
    const doProvision = process.env.COLAB_LIVE_PROVISION === "1";
    if (!doProvision) {
      console.log(
        JSON.stringify(
          {
            provider,
            verificationLevel: "CONTROL_PLANE_VERIFIED",
            status: "SUCCEEDED",
            evidence: [
              "Colab runtimespecs endpoint accepted the credential.",
              "Set COLAB_LIVE_PROVISION=1 to explicitly create and delete a runtime.",
              "Code execution remains unavailable in the Colab adapter by design.",
            ],
          },
          null,
          2,
        ),
      );
      return;
    }

    const result = await adapter.provision(
      {
        idempotencyKey: randomUUID(),
        name: "shortforge-live-colab-probe",
        timeoutMs: Number(process.env.NOTEBOOK_LIVE_TIMEOUT_MS || 120000),
        gpuType: process.env.COLAB_LIVE_GPU || undefined,
      },
      credentials,
    );

    try {
      console.log(
        JSON.stringify(
          {
            provider,
            verificationLevel: "CONTROL_PLANE_VERIFIED",
            status: "SUCCEEDED",
            runtime: {
              resourceId: result.runtime.resourceId,
              state: result.runtime.state,
              notebookUrl: result.runtime.notebookUrl,
              endpointUri: result.runtime.endpointUri,
            },
            evidence: result.evidence,
          },
          null,
          2,
        ),
      );
    } finally {
      await adapter.terminate(result.runtime, credentials);
    }
    return;
  }

  const timeoutMs = Number(process.env.NOTEBOOK_LIVE_TIMEOUT_MS || 180000);
  const runtime = await adapter.provision(
    {
      idempotencyKey: "shortforge-live-lightning-" + Date.now(),
      name: "shortforge-live-lightning-probe",
      timeoutMs,
      gpuType: process.env.LIGHTNING_LIVE_MACHINE || process.env.LIGHTNING_MACHINE || "CPU",
    },
    credentials,
  );

  try {
    const result = await adapter.execute(
      {
        runtime: runtime.runtime,
        command: 'python -c "print(\'SHORTFORGE_LIGHTNING_LIVE_OK\')"',
        timeoutMs,
      },
      credentials,
    );

    console.log(JSON.stringify({ provider, liveResult: result }, null, 2));

    if (
      result.status !== "SUCCEEDED" ||
      !result.stdout?.includes("SHORTFORGE_LIGHTNING_LIVE_OK")
    ) {
      throw new Error("Lightning live code-execution probe did not pass.");
    }
  } finally {
    await adapter.terminate(runtime.runtime, credentials);
  }
}

async function main() {
  const registry = createDefaultNotebookRegistry();

  console.log("=== SHORTFORGE NOTEBOOK FABRIC ===");
  console.table(
    registry.metadata().map((m) => ({
      provider: m.providerType,
      runtime: m.runtimeKind,
      payment: m.paymentRequirement,
      gpu: m.capabilities.supportsGpu,
      provision: m.capabilities.canProvision,
      execute: m.capabilities.canExecuteCode,
      persistence: m.capabilities.supportsPersistence,
      productionWorkerEligible: m.capabilities.productionWorkerEligible,
    })),
  );

  const selected = process.env.NOTEBOOK_PROVIDER as NotebookProviderType | undefined;
  if (!selected) {
    console.log(
      "No NOTEBOOK_PROVIDER selected; contract inspection only. No external calls performed.",
    );
    return;
  }

  const valid: NotebookProviderType[] = [
    "KAGGLE",
    "COLAB",
    "PAPERSPACE",
    "LIGHTNING",
    "HF_ZEROGPU",
  ];

  if (!valid.includes(selected)) {
    throw new Error("Unknown NOTEBOOK_PROVIDER: " + selected);
  }

  if (process.env.NOTEBOOK_LIVE === "1") {
    await runLive(selected);
    return;
  }

  const adapter = registry.get(selected);
  if (!adapter) throw new Error("Notebook provider not registered: " + selected);

  const validation = await adapter.validateCredentials(credentialsFor(selected));
  console.log(JSON.stringify(validation, null, 2));

  if (selected === "HF_ZEROGPU") {
    console.log("ZeroGPU selected: use its Space API boundary; it is not treated as a VM worker.");
    return;
  }

  if (!validation.authenticated) {
    throw new Error(
      "Notebook provider " + selected + " is not authenticated/configured.",
    );
  }

  console.log("Authenticated. Set NOTEBOOK_LIVE=1 for the provider-specific live smoke.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
