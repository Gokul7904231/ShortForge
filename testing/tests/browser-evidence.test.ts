import * as assert from "node:assert";
import * as path from "node:path";
import * as fs from "node:fs";
import { ChromeDevToolsClient } from "../runtime/ChromeDevToolsClient";
import { BrowserRedactor } from "../runtime/BrowserRedactor";
import { BrowserPerformanceCollector } from "../runtime/BrowserPerformanceCollector";
import { BrowserJudge } from "../judges/deterministic/browserJudge";
import { BrowserShortforge001Scenario } from "../scenarios/browser/browser-shortforge-001";
import { EvidenceGraphBuilder } from "../graphs/EvidenceGraph";
import { MissionGraphBuilder } from "../graphs/MissionGraph";
import { GraphProjections } from "../graphs/GraphProjections";
import type { MissionRun } from "../model/MissionRun";
import type { BrowserRunRecord } from "../contracts/browser.contract";
import { MarkdownSerializer } from "../reports/serializers/markdownSerializer";
import type { MissionReport } from "../reports/MissionReport";

export async function runBrowserEvidenceTestSuite(): Promise<{ passed: boolean; testCount: number }> {
  console.log(`\n======================================================`);
  console.log(` FACTORYOS BROWSER EVIDENCE V1 REGRESSION SUITE (A - I)`);
  console.log(`======================================================\n`);

  let testCount = 0;
  const client = new ChromeDevToolsClient("http://127.0.0.1:9222");

  // -------------------------------------------------------------
  // Test A: Chrome unavailable -> BLOCKED, no fake evidence
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test A] Chrome unavailable produces BLOCKED with zero fake evidence...`);
    // Connect to a closed port
    const result = await BrowserShortforge001Scenario.execute({
      cdpEndpoint: "http://127.0.0.1:9223", // Closed port guaranteed
      runId: "run_test_blocked",
    });

    assert.strictEqual(result.run.finalVerdict, "BLOCKED", "Verdict must be BLOCKED when CDP is unavailable");
    assert.strictEqual(result.run.browserRecord?.status, "BLOCKED", "BrowserRecord status must be BLOCKED");
    assert.strictEqual(
      result.run.browserRecord?.executionMode,
      "BLOCKED_BROWSER",
      "Execution mode must be BLOCKED_BROWSER"
    );
    assert.strictEqual(
      result.run.browserRecord?.records.length,
      0,
      "Must not manufacture fake browser evidence when CDP is offline"
    );
    assert.strictEqual(result.report.finalVerdict, "BLOCKED", "MissionReport finalVerdict must be BLOCKED");
    console.log(`  -> PASSED: Verified graceful BLOCKED handling with zero fabricated evidence.\n`);
  }

  // -------------------------------------------------------------
  // Test B: Console observation -> CONSOLE evidence, truth = OBSERVED
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test B] Console error observation captured as CONSOLE with truthLevel OBSERVED...`);
    const consoleRecord = client.createConsoleRecord({
      missionId: "mis_test_b",
      runId: "run_test_b",
      page: "ShortForge Video Studio",
      url: "http://127.0.0.1:3000/studio",
      level: "error",
      text: "Uncaught TypeError: Cannot read properties of undefined (reading 'timeline')",
      source: "app.bundle.js:142:15",
    });

    assert.strictEqual(consoleRecord.kind, "CONSOLE");
    assert.strictEqual(consoleRecord.truthLevel, "OBSERVED");
    assert.strictEqual((consoleRecord.metadata as any).level, "error");
    assert.ok((consoleRecord.metadata as any).text.includes("Cannot read properties of undefined"));
    console.log(`  -> PASSED: Console error recorded with faithful truthLevel OBSERVED.\n`);
  }

  // -------------------------------------------------------------
  // Test C: Network 500 -> NETWORK evidence & deterministic failure finding
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test C] Network HTTP 500 captured and evaluated by BrowserJudge...`);
    const netRecord = client.createNetworkRecord({
      missionId: "mis_test_c",
      runId: "run_test_c",
      page: "ShortForge Render Surface",
      url: "http://127.0.0.1:3000/api/render-job",
      method: "POST",
      statusCode: 500,
      timingMs: 420,
      failureReason: "Internal Server Error",
    });

    assert.strictEqual(netRecord.kind, "NETWORK");
    assert.strictEqual(netRecord.truthLevel, "OBSERVED");
    assert.strictEqual((netRecord.metadata as any).statusCode, 500);
    assert.strictEqual((netRecord.metadata as any).isFailure, true);

    const judgeResult = BrowserJudge.judge({
      status: "FAIL",
      executionMode: "LIVE_BROWSER",
      targetEndpoint: "http://127.0.0.1:9222",
      targetUrl: "http://127.0.0.1:3000",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      records: [netRecord],
    });

    assert.strictEqual(judgeResult.valid, false, "BrowserJudge must fail when HTTP 500 is observed");
    assert.ok(
      judgeResult.findings.some((f) => f.rule === "browser/network-5xx"),
      "Must generate browser/network-5xx finding"
    );
    assert.strictEqual(judgeResult.findings[0].evidence[0], netRecord.id, "Finding must link to exact evidence ID");
    console.log(`  -> PASSED: Network 500 triggered deterministic browser/network-5xx finding.\n`);
  }

  // -------------------------------------------------------------
  // Test D: DOM state capture -> DOM_STATE evidence, truth = OBSERVED
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test D] DOM element state captured faithfully...`);
    const domRecord = client.createDomStateRecord({
      missionId: "mis_test_d",
      runId: "run_test_d",
      page: "ShortForge Dashboard",
      url: "http://127.0.0.1:3000",
      selector: "button#render-btn",
      visible: true,
      enabled: false,
      text: "Generating Video...",
      attributes: { "aria-busy": "true", role: "button" },
    });

    assert.strictEqual(domRecord.kind, "DOM_STATE");
    assert.strictEqual(domRecord.truthLevel, "OBSERVED");
    assert.strictEqual((domRecord.metadata as any).selector, "button#render-btn");
    assert.strictEqual((domRecord.metadata as any).visible, true);
    assert.strictEqual((domRecord.metadata as any).enabled, false);
    console.log(`  -> PASSED: DOM element state faithfully captured.\n`);
  }

  // -------------------------------------------------------------
  // Test E: Screenshot capture -> SCREENSHOT evidence with disk sha256
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test E] Screenshot persistence and SHA-256 grounding...`);
    // Minimal 1x1 PNG buffer
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
      0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d,
      0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const shotRecord = client.createScreenshotRecord({
      missionId: "mis_test_e",
      runId: "run_test_e",
      page: "ShortForge Player",
      url: "http://127.0.0.1:3000/player",
      buffer: pngHeader,
    });

    assert.strictEqual(shotRecord.kind, "SCREENSHOT");
    assert.strictEqual(shotRecord.truthLevel, "OBSERVED");
    const meta = shotRecord.metadata as any;
    assert.ok(fs.existsSync(meta.localPath), "Screenshot must exist physically on disk");
    assert.strictEqual(meta.byteLength, pngHeader.length);
    assert.ok(meta.sha256 && meta.sha256.length === 64, "Must compute valid SHA-256");
    console.log(`  -> PASSED: Screenshot saved to disk with verified SHA-256: ${meta.sha256}.\n`);
  }

  // -------------------------------------------------------------
  // Test F: Performance observation -> PERFORMANCE metrics
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test F] Performance metrics observation via BrowserPerformanceCollector...`);
    const collector = new BrowserPerformanceCollector(client, {
      maxDomContentLoadedMs: 2500,
      maxLoadDurationMs: 4000,
    });

    const perfRecords = collector.recordNavigationMetrics({
      missionId: "mis_test_f",
      runId: "run_test_f",
      page: "ShortForge Home",
      url: "http://127.0.0.1:3000",
      metrics: {
        domContentLoadedMs: 820,
        loadDurationMs: 1450,
        firstContentfulPaintMs: 650,
        jsHeapSizeBytes: 42000000,
      },
    });

    assert.strictEqual(perfRecords.length, 4);
    for (const r of perfRecords) {
      assert.strictEqual(r.kind, "PERFORMANCE");
      assert.strictEqual(r.truthLevel, "OBSERVED");
      assert.strictEqual((r.metadata as any).thresholdExceeded, false);
    }
    console.log(`  -> PASSED: Navigation and heap performance recorded as raw OBSERVED evidence.\n`);
  }

  // -------------------------------------------------------------
  // Test G: Secret Redaction
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test G] Sensitive headers, tokens, and query params redacted...`);
    const rawHeaders = {
      Authorization: "Bearer ya29.a0AfH6SMD_SECRET_GOOGLE_TOKEN",
      Cookie: "session_id=s3cr3t_cookie_val; token=xyz123",
      "X-Api-Key": "AIzaSy_PRIVATE_GEMINI_KEY",
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const sanitized = BrowserRedactor.redactHeaders(rawHeaders);
    assert.strictEqual(sanitized["Authorization"], "[REDACTED]");
    assert.strictEqual(sanitized["Cookie"], "[REDACTED]");
    assert.strictEqual(sanitized["X-Api-Key"], "[REDACTED]");
    assert.strictEqual(sanitized["Accept"], "application/json");

    const sanitizedUrl = BrowserRedactor.redactUrl(
      "http://127.0.0.1:3000/api/render?apiKey=supersecret123&jobId=job_99"
    );
    assert.ok(!sanitizedUrl.includes("supersecret123"), "Secret API key must not appear in URL");
    assert.ok(sanitizedUrl.includes("apiKey=%5BREDACTED%5D") || sanitizedUrl.includes("apiKey=[REDACTED]"));
    assert.ok(sanitizedUrl.includes("jobId=job_99"), "Non-secret parameter preserved");

    const sanitizedText = BrowserRedactor.redactText("Failed request with Bearer secret_token_value_abc");
    assert.ok(!sanitizedText.includes("secret_token_value_abc"));
    assert.ok(sanitizedText.includes("Bearer [REDACTED]"));
    console.log(`  -> PASSED: Sensitive headers, cookies, query parameters, and tokens redacted.\n`);
  }

  // -------------------------------------------------------------
  // Test H: EvidenceGraph Integration
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test H] Browser evidence incorporated into canonical EvidenceGraph...`);
    const domRecord = client.createDomStateRecord({
      missionId: "mis_test_h",
      runId: "run_test_h",
      page: "ShortForge",
      url: "http://127.0.0.1:3000",
      selector: "main#content",
      visible: true,
    });
    const netRecord = client.createNetworkRecord({
      missionId: "mis_test_h",
      runId: "run_test_h",
      page: "ShortForge",
      url: "http://127.0.0.1:3000/api/status",
      method: "GET",
      statusCode: 200,
    });

    const browserRecord: BrowserRunRecord = {
      status: "PASS",
      executionMode: "SIMULATED_BROWSER",
      targetEndpoint: "http://127.0.0.1:9222",
      targetUrl: "http://127.0.0.1:3000",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      records: [domRecord, netRecord],
    };

    const mockRun: MissionRun = {
      missionId: "mis_test_h",
      runId: "run_test_h",
      goal: "Test EvidenceGraph Integration",
      codeVersion: "1.0.0",
      environment: { platform: "win32", nodeVersion: "20.0" },
      executionMode: "REAL",
      startedAt: new Date().toISOString(),
      finalVerdict: "PASS",
      events: [],
      artifacts: [],
      lineage: [],
      decisions: [],
      findings: [],
      receipts: [],
      browserRecord,
      limitations: [],
    };

    const evGraph = EvidenceGraphBuilder.fromMissionRun(mockRun);
    const domNode = evGraph.evidenceNodes.find((n) => n.id === domRecord.id);
    const netNode = evGraph.evidenceNodes.find((n) => n.id === netRecord.id);

    assert.ok(domNode, "DOM record must exist in canonical EvidenceGraph");
    assert.strictEqual(domNode.category, "BROWSER_DOM_STATE");
    assert.strictEqual(domNode.truthLevel, "OBSERVED");

    assert.ok(netNode, "Network record must exist in canonical EvidenceGraph");
    assert.strictEqual(netNode.category, "BROWSER_NETWORK_RECORD");

    const edge = evGraph.evidenceEdges.find((e) => e.evidenceNodeId === domRecord.id);
    assert.ok(edge, "Evidence edge must exist connecting browser node to UI state");
    assert.strictEqual(edge.relationship, "OBSERVES_DOM_STATE");
    console.log(`  -> PASSED: Browser observations successfully integrated into EvidenceGraph.\n`);
  }

  // -------------------------------------------------------------
  // Test I: MissionReport & Slayer / Overseer Projections
  // -------------------------------------------------------------
  {
    testCount++;
    console.log(`[Test I] Browser summary in MissionReport, SlayerView, and OverseerView...`);
    const net500 = client.createNetworkRecord({
      missionId: "mis_test_i",
      runId: "run_test_i",
      page: "ShortForge",
      url: "http://127.0.0.1:3000/api/render",
      method: "POST",
      statusCode: 500,
    });
    const consoleErr = client.createConsoleRecord({
      missionId: "mis_test_i",
      runId: "run_test_i",
      page: "ShortForge",
      url: "http://127.0.0.1:3000",
      level: "error",
      text: "API 500 Server Error",
    });

    const browserRecord: BrowserRunRecord = {
      status: "FAIL",
      executionMode: "SIMULATED_BROWSER",
      targetEndpoint: "http://127.0.0.1:9222",
      targetUrl: "http://127.0.0.1:3000",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      records: [net500, consoleErr],
    };

    const mockRun: MissionRun = {
      missionId: "mis_test_i",
      runId: "run_test_i",
      goal: "Test Report & Projections",
      codeVersion: "1.0.0",
      environment: { platform: "win32", nodeVersion: "20.0" },
      executionMode: "REAL",
      startedAt: new Date().toISOString(),
      finalVerdict: "FAIL",
      events: [],
      artifacts: [],
      lineage: [],
      decisions: [],
      findings: [],
      receipts: [],
      browserRecord,
      limitations: [],
    };

    const missionGraph = MissionGraphBuilder.fromMissionRun(mockRun);
    const evGraph = EvidenceGraphBuilder.fromMissionRun(mockRun);

    // 1. Overseer Operational View
    const overseerView = GraphProjections.createOverseerView(missionGraph, evGraph);
    assert.ok(overseerView.browserHealth, "Overseer must have browser health summary");
    assert.strictEqual(overseerView.browserHealth.status, "FAIL");
    assert.strictEqual(overseerView.browserHealth.consoleErrorCount, 1);
    assert.strictEqual(overseerView.browserHealth.networkFailureCount, 1);

    // 2. Slayer Forensic View
    const slayerView = GraphProjections.createSlayerView(missionGraph, undefined, evGraph);
    assert.ok(slayerView.browserEvidenceChain, "Slayer must receive browser evidence chain");
    assert.strictEqual(slayerView.browserEvidenceChain.length, 2);
    assert.ok(slayerView.primaryEvidencePath.includes(net500.id));

    // 3. Markdown Serializer output
    const report: MissionReport = {
      missionId: "mis_test_i",
      runId: "run_test_i",
      finalVerdict: "FAIL",
      executionMode: "REAL",
      environment: {
        platform: "win32",
        nodeVersion: "20.0",
        ffmpegAvailable: true,
        ffprobeAvailable: true,
        geminiConfigured: false,
        gitCommit: "44c9c2c",
      },
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      totalDurationMs: 120,
      stageAudits: [],
      lineageVerification: { valid: true, edgesCount: 0, edges: [] },
      mediaHardGates: { passed: false, overallScore: 0, gates: {} },
      deliveryStatus: {
        local: { status: "NOT_ATTEMPTED", delivered: false },
        remote: { status: "NOT_ATTEMPTED", delivered: false },
        delivered: false,
      },
      efficiency: { totalExecutionTimeMs: 120, perFloorDurationMs: {}, perFloorDurationTruth: {} },
      findings: [],
      claimAudits: [],
      browserEvidence: {
        status: "FAIL",
        executionMode: "SIMULATED_BROWSER",
        targetEndpoint: "http://127.0.0.1:9222",
        targetUrl: "http://127.0.0.1:3000",
        consoleErrorsCount: 1,
        networkFailuresCount: 1,
        domElementsInspected: 0,
        screenshotsCaptured: 0,
        performanceMetricsCount: 0,
        evidenceReferences: [net500.id, consoleErr.id],
      },
      limitations: [],
      missionGraph,
      evidenceGraph: evGraph,
    };

    const md = MarkdownSerializer.serialize(report);
    assert.ok(md.includes("## 8. Browser Evidence & DevTools Session"), "Markdown must contain Section 8");
    assert.ok(md.includes("1 Console Errors, 1 Network Failures"), "Must report anomaly counts");
    assert.ok(md.includes(net500.id), "Must report evidence ID");
    console.log(`  -> PASSED: Browser evidence rendered in MissionReport, SlayerView, and OverseerView.\n`);
  }

  console.log(`======================================================`);
  console.log(` ALL ${testCount} BROWSER EVIDENCE TESTS PASSED!`);
  console.log(`======================================================\n`);

  return { passed: true, testCount };
}

if (process.argv[1]?.includes("browser-evidence.test")) {
  runBrowserEvidenceTestSuite().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
