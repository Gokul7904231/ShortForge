/**
 * Fail-closed guards for the distributed render-worker workflows.
 *
 * The audited defects these lock down:
 *  1. `RENDER_WORKER_SECRET || '<committed literal>'` fallbacks (compromised secret).
 *  2. `DISPATCH_JOB_ID` read but never wired to the event payload.
 *  3. A named-job dispatch silently degrading into an unrelated generic queue claim.
 *  4. Claim/dispatch exceptions converted into `claimed=false`, i.e. a broken worker
 *     attempt looking like an ordinary empty queue.
 *  5. `gh workflow run ... || echo` and a swallowed callback error reporting green.
 *
 * Static assertions on purpose: they are dependency-free and fail if someone
 * reintroduces the pattern, which is the point.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../");
const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github", "workflows");

const DISPATCHER = path.join(WORKFLOWS_DIR, "factoryos-render-worker.yml");
const RENDERER = path.join(WORKFLOWS_DIR, "factoryos-basic-render.yml");
const CLAIM_SCRIPT = path.join(
  REPO_ROOT,
  "services",
  "rendering-engine",
  "scripts",
  "github_dispatch_claim.py"
);

const read = (file: string) => readFileSync(file, "utf8");

describe("render worker secret handling", () => {
  it("keeps the compromised literal out of every workflow", () => {
    const offenders = readdirSync(WORKFLOWS_DIR)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .filter((name) =>
        read(path.join(WORKFLOWS_DIR, name)).includes(
          "factoryos-render-worker-secret-key-2026"
        )
      );
    expect(offenders).toEqual([]);
  });

  it("has no inline default for the render worker secret", () => {
    for (const file of [DISPATCHER, RENDERER]) {
      expect(read(file)).not.toMatch(/RENDER_WORKER_SECRET\s*\|\|/);
    }
  });

  it("sources the secret only from the configured repository secret", () => {
    expect(read(DISPATCHER)).toContain(
      "RENDER_WORKER_SECRET: ${{ secrets.RENDER_WORKER_SECRET }}"
    );
    expect(read(RENDERER)).toContain(
      "WORKER_SECRET: ${{ secrets.RENDER_WORKER_SECRET }}"
    );
  });
});

describe("dispatcher claim path", () => {
  it("delegates the claim to the tested client script", () => {
    expect(read(DISPATCHER)).toContain(
      "python3 services/rendering-engine/scripts/github_dispatch_claim.py"
    );
    expect(existsSync(CLAIM_SCRIPT)).toBe(true);
  });

  it("fails closed before any request when the secret is missing", () => {
    const script = read(CLAIM_SCRIPT);
    expect(script).toMatch(/RENDER_WORKER_SECRET is not configured/);
    // The preflight must return before the request is constructed.
    expect(script.indexOf("is not configured")).toBeLessThan(
      script.indexOf("urllib.request.Request(")
    );
  });

  it("keeps only the supported triggers: schedule sweep and manual run", () => {
    const dispatcher = read(DISPATCHER);
    expect(dispatcher).toMatch(/schedule:/);
    expect(dispatcher).toMatch(/workflow_dispatch:/);
    // Dead configuration: no in-repository code emits factoryos_render_job
    // (full-repo search evidence); external senders are not verifiable from this
    // environment, so the trigger must stay removed on both workflows.
    // Match the definition syntax so the explanatory comment cannot false-positive.
    expect(dispatcher).not.toMatch(/repository_dispatch\s*:/);
    expect(dispatcher).not.toContain("DISPATCH_JOB_ID");
    expect(read(RENDERER)).not.toMatch(/repository_dispatch\s*:/);
    expect(read(RENDERER)).not.toContain("client_payload");
  });

  it("resolves named-job inputs only from workflow_dispatch inputs", () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain("INPUT_JOB_ID: ${{ github.event.inputs.jobId }}");
    expect(renderer).toContain(
      "INPUT_EXEC_TOKEN: ${{ github.event.inputs.executionToken }}"
    );
  });

  it("keeps the dispatch inputs exact: jobId and executionToken", () => {
    const dispatcher = read(DISPATCHER);
    const dispatchStep = dispatcher.slice(dispatcher.indexOf("gh workflow run"));
    expect(dispatchStep).toContain("-f jobId=");
    expect(dispatchStep).toContain('-f executionToken="$EXECUTION_TOKEN"');
  });

  it("refuses a named-job dispatch instead of claiming an unrelated job", () => {
    const script = read(CLAIM_SCRIPT);
    expect(script).toMatch(/cannot claim a named job/);
    expect(script).toMatch(/Refusing to claim an unrelated queued job/);
  });

  it("treats an empty queue as no-work and any failure as a failure", () => {
    const script = read(CLAIM_SCRIPT);
    // Empty queue is the only outcome that yields claimed=false.
    expect(script).toMatch(/No queued basic video jobs to process/);
    // HTTP/timeout/shape errors must not produce claimed=false.
    const failureBlock = script.slice(script.indexOf("except urllib.error.HTTPError"));
    expect(failureBlock).not.toContain('"claimed", "false"');
  });

  it("does not let a secret or token reach a log sink", () => {
    const script = read(CLAIM_SCRIPT);
    expect(script).not.toMatch(/print\(.*execution_token/);
    expect(script).not.toMatch(/print\(.*RENDER_WORKER_SECRET/);
    // The token may only be published via GITHUB_OUTPUT, and is masked without one.
    expect(script).toContain("SENSITIVE_OUTPUT_KEYS");
  });

  it("does not suppress a failed downstream dispatch", () => {
    const dispatcher = read(DISPATCHER);
    const dispatchStep = dispatcher.slice(dispatcher.indexOf("gh workflow run"));
    expect(dispatchStep).not.toMatch(/\|\|\s*echo/);
    expect(dispatcher).not.toContain("Workflow dispatch queued locally");
  });

  it("masks the execution token in the dispatch step", () => {
    expect(read(DISPATCHER)).toContain("::add-mask::$EXECUTION_TOKEN");
  });
});

describe("renderer callback path", () => {
  it("fails closed before calling back without a configured secret", () => {
    expect(read(RENDERER)).toMatch(
      /is not configured; refusing to call back/
    );
  });

  it("does not report a failed callback as success", () => {
    const renderer = read(RENDERER);
    expect(renderer).not.toContain("Callback notice");
    expect(renderer).toMatch(/::error::Callback failed/);
  });

  it("still records completion only from a verified result artifact", () => {
    // Pre-existing guarantee that must survive: no videoUrl => failed status.
    expect(read(RENDERER)).toContain("No verified videoUrl found in engine result.json");
  });
});

describe("preserved authority boundaries", () => {
  it("keeps the dispatcher serialised under one concurrency group", () => {
    expect(read(DISPATCHER)).toContain("group: factoryos-render-dispatcher");
    expect(read(DISPATCHER)).toContain("cancel-in-progress: false");
  });

  it("keeps the 1-minute scheduled sweep", () => {
    expect(read(DISPATCHER)).toContain('cron: "* * * * *"');
  });

  it("does not widen the renderer job token permissions", () => {
    const renderer = read(RENDERER);
    expect(renderer).toMatch(/permissions:[\s\S]*?contents:\s*read/);
    expect(renderer).not.toMatch(/contents:\s*write/);
  });

  it("keeps the renderer's input validation fail-closed", () => {
    const renderer = read(RENDERER);
    expect(renderer).toContain("Missing executionToken — fail-closed (no jobId fallback)");
    expect(renderer).toContain("^[a-zA-Z0-9_-]{8,64}$");
  });
});
