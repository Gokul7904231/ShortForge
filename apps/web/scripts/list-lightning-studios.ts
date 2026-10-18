import { runProcess } from "../factoryos/core/compute/notebooks/NotebookUtils";

const INSPECTION_TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  const teamspace = process.env.LIGHTNING_TEAMSPACE?.trim();
  if (!teamspace) {
    console.warn(
      "[lightning-inspection] LIGHTNING_TEAMSPACE is missing; skipping this diagnostic. " +
        "The end-to-end physical-proof step will validate required configuration.",
    );
    return;
  }

  const [org, space] = teamspace.split("/", 2);
  if (!org || !space) {
    console.warn(
      "[lightning-inspection] LIGHTNING_TEAMSPACE must be <org>/<teamspace>; " +
        "skipping this diagnostic so the physical-proof step can report the configuration error.",
    );
    return;
  }

  let result: { exitCode: number; stdout: string; stderr: string };

  try {
    result = await runProcess(
      "lightning",
      ["studio", "list", "--teamspace", teamspace],
      {
        timeoutMs: INSPECTION_TIMEOUT_MS,
        env: {
          ...process.env,
          LIGHTNING_NON_INTERACTIVE: "1",
        },
      },
    );
  } catch (error) {
    console.warn(
      "[lightning-inspection] Could not run the optional Studio listing: " +
        (error instanceof Error ? error.message : String(error)),
    );
    return;
  }

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.exitCode === 0) {
    console.log("[lightning-inspection] Studio listing completed.");
    return;
  }

  if (result.exitCode === 124) {
    console.warn(
      "[lightning-inspection] Studio listing exceeded " +
        INSPECTION_TIMEOUT_MS +
        "ms and was stopped. Continuing to the bounded end-to-end physical-proof step.",
    );
    return;
  }

  console.warn(
    "[lightning-inspection] Studio listing exited " +
      result.exitCode +
      ". This is diagnostic only; continuing so the physical-proof step can determine provider readiness.",
  );
}

main().catch((error: unknown) => {
  console.error(
    "[lightning-inspection] Unexpected diagnostic error:",
    error instanceof Error ? error.message : String(error),
  );
  // This is deliberately best-effort. Required credentials, provider calls,
  // rendering, download, CAS integrity, and F07 validation are enforced by the
  // next end-to-end proof step, not by this informational listing.
  process.exitCode = 0;
});
