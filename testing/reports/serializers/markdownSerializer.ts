import type { MissionReport } from "../MissionReport";

export class MarkdownSerializer {
  public static serialize(report: MissionReport): string {
    const lines: string[] = [];

    lines.push("# FactoryOS Canonical Mission Evaluation Report");
    lines.push(`**Mission ID**: \`${report.missionId}\` | **Run ID**: \`${report.runId}\``);
    lines.push(`**Verdict**: **${report.finalVerdict}** | **Execution Mode**: \`${report.executionMode}\``);
    lines.push(`**Commit**: \`${report.environment.gitCommit}\` | **Platform**: \`${report.environment.platform}\``);
    lines.push(`**Duration**: ${report.totalDurationMs} ms | **Started**: ${report.startedAt}`);
    lines.push("");

    if (report.verdicts) {
      lines.push("---");
      lines.push("## 1. Multi-Dimensional Verdicts");
      lines.push("");
      lines.push("| Dimension | Verdict | Criteria |");
      lines.push("| :--- | :--- | :--- |");
      lines.push(`| **Technical Execution** | \`${report.verdicts.technicalExecution}\` | Overseer DAG terminal status OK |`);
      lines.push(`| **Artifact Integrity** | \`${report.verdicts.artifactIntegrity}\` | Physical bytes & SHA-256 verified |`);
      lines.push(`| **Artifact Lineage** | \`${report.verdicts.lineage}\` | Producer → Artifact → Consumer hash match |`);
      lines.push(`| **F7 Media Probe** | \`${report.verdicts.f7Verification}\` | Forensic compliance hard gates passed |`);
      lines.push(`| **User Goal** | \`${report.verdicts.goal}\` | Duration target, 9:16 aspect, topic alignment |`);
      lines.push(`| **Quality Constraints** | \`${report.verdicts.quality}\` | Stream codecs, geometry, zero corrupt frames |`);
      lines.push(`| **Local Delivery** | \`${report.verdicts.localDelivery}\` | Committed to durable local outbox |`);
      lines.push(`| **Remote Delivery** | \`${report.verdicts.remoteDelivery}\` | Google Drive cloud upload |`);
      lines.push(`| **Recovery Engine** | \`${report.verdicts.recovery}\` | Provider fallback transparency |`);
      lines.push(`| **Overall Verdict** | **\`${report.verdicts.overall}\`** | Mandatory criteria conjunction |`);
      lines.push("");
    }

    lines.push("---");
    lines.push("## 2. Stage Execution & Provenance Truth");
    lines.push("");
    lines.push("| Floor Stage | Status | Execution Truth | Truth Level | Duration (ms) | Timing Truth | Produced Artifacts | Consumed Artifacts |");
    lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
    for (const stage of report.stageAudits) {
      const researchTag = stage.researchTruth ? ` [${stage.researchTruth}]` : "";
      lines.push(
        `| **${stage.floorId}** | \`${stage.status}\` | \`${stage.executionTruth}\`${researchTag} | \`${stage.truthLevel}\` | ${stage.durationMs} | \`${stage.durationTruth}\` | ${stage.artifactsProduced.join(", ") || "None"} | ${stage.artifactsConsumed.join(", ") || "None"} |`
      );
    }
    lines.push("");

    lines.push("---");
    lines.push("## 3. Media Verification & F7 Hard Gates");
    lines.push(`- **Overall Pass**: \`${report.mediaHardGates.passed}\``);
    lines.push(`- **Audit Score**: \`${report.mediaHardGates.overallScore}/100\``);
    lines.push("");
    lines.push("| Hard Gate | Status |");
    lines.push("| :--- | :--- |");
    for (const [gate, passed] of Object.entries(report.mediaHardGates.gates)) {
      lines.push(`| \`${gate}\` | ${passed ? "✅ PASS" : "❌ FAIL"} |`);
    }
    lines.push("");

    lines.push("---");
    lines.push("## 4. Delivery Status & Physical Proofs");
    lines.push(`- **Local Outbox Delivery**: \`${report.deliveryStatus.local.status}\` (${report.deliveryStatus.local.delivered ? "✅ PASS" : "❌ FAIL"})`);
    if (report.deliveryStatus.local.location) {
      lines.push(`  - **Outbox Path**: \`${report.deliveryStatus.local.location}\``);
    }
    if (report.deliveryStatus.local.sha256) {
      lines.push(`  - **SHA-256 Digest**: \`${report.deliveryStatus.local.sha256}\``);
    }
    lines.push(`- **Remote Google Drive Delivery**: \`${report.deliveryStatus.remote.status}\` (${report.deliveryStatus.remote.delivered ? "✅ PASS" : "⚠️ " + report.deliveryStatus.remote.status})`);
    if (report.deliveryStatus.remote.note) {
      lines.push(`  - **Note**: ${report.deliveryStatus.remote.note}`);
    }
    lines.push("");

    if (report.claimAudits && report.claimAudits.length > 0) {
      lines.push("---");
      lines.push("## 5. Claim-to-Evidence Audit");
      lines.push("");
      lines.push("| Major Evaluated Claim | Truth Level | Evaluator | Verdict | Supporting Evidence References |");
      lines.push("| :--- | :--- | :--- | :--- | :--- |");
      for (const ca of report.claimAudits) {
        lines.push(
          `| ${ca.claim} | \`${ca.truthLevel}\` | \`${ca.evaluator}\` | \`${ca.verdict}\` | ${ca.evidenceReferences.slice(0, 2).join("; ") || "Verified runtime record"} |`
        );
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("## 6. Structured Findings & Diagnostics");
    if (report.findings.length === 0) {
      lines.push("*Zero defect findings detected. All deterministic assertions, contracts, and lineage satisfied.*");
    } else {
      for (const f of report.findings) {
        lines.push(`### [${f.severity.toUpperCase()}] ${f.rule} (${f.subject})`);
        lines.push(`- **Expected**: ${f.expected}`);
        lines.push(`- **Observed**: ${f.observed}`);
        if (f.rootCause) lines.push(`- **Root Cause**: ${f.rootCause}`);
        lines.push(`- **Evidence**: ${f.evidence.join(" | ")}`);
        lines.push("");
      }
    }
    lines.push("");

    lines.push("---");
    lines.push("## 7. Environment Awareness & Degraded Capabilities");
    if (report.degradedCapabilities && report.degradedCapabilities.length > 0) {
      for (const deg of report.degradedCapabilities) {
        lines.push(`- ⚠️ **Degraded Capability [${deg.capability}]**: Primary provider \`${deg.primaryProvider}\` fell back to \`${deg.fallbackUsed}\`. ${deg.reason} **Semantic consequence**: *${deg.unprovenBehavior}*`);
      }
    }
    for (const lim of report.limitations) {
      lines.push(`- ℹ️ ${lim}`);
    }
    lines.push("");

    if (report.browserEvidence) {
      lines.push("---");
      lines.push("## 8. Browser Evidence & DevTools Session");
      const b = report.browserEvidence;
      lines.push(`- **Status**: \`${b.status}\` | **Execution Mode**: \`${b.executionMode}\``);
      lines.push(`- **Target URL**: ${b.targetUrl} (Endpoint: \`${b.targetEndpoint}\`)`);
      if (b.reason) {
        lines.push(`- **Note / Reason**: ${b.reason}`);
      }
      lines.push(`- **Inspections**: ${b.domElementsInspected} DOM Elements, ${b.screenshotsCaptured} Screenshots, ${b.performanceMetricsCount} Performance Metrics`);
      lines.push(`- **Anomalies**: ${b.consoleErrorsCount} Console Errors, ${b.networkFailuresCount} Network Failures`);
      lines.push(`- **Canonical Evidence References**: ${b.evidenceReferences.length > 0 ? b.evidenceReferences.join(", ") : "None"}`);
      lines.push("");
    }

    if (report.situationComms) {
      lines.push("---");
      lines.push("## 9. Situation Record & Distributed Comms Verification");
      const sc = report.situationComms;
      lines.push(`- **Status**: \`${sc.status}\` | **Records Evaluated**: ${sc.recordsCount}`);
      lines.push("- **Situation Record Invariant Matrix**:");
      lines.push("```text");
      lines.push("Situation Record:");
      lines.push(`    CREATED        ${sc.created ? "✓" : "❌"}`);
      lines.push(`    TRANSMITTED    ${sc.transmitted ? "✓" : "❌"}`);
      lines.push(`    RECEIVED       ${sc.received ? "✓" : "❌"}`);
      lines.push(`    GRAPH          ${sc.graphPreserved ? "✓" : "❌"}`);
      lines.push(`    EVIDENCE       ${sc.evidencePreserved ? "✓" : "❌"}`);
      lines.push(`    TRUTH          ${sc.truthPreserved ? "✓" : "❌"}`);
      lines.push(`    INTEGRITY      ${sc.integrityVerified ? "✓" : "❌"}`);
      lines.push("```");
      if (sc.liveProof) {
        lines.push("");
        lines.push("### Live Agent-to-Agent Handoff Proof");
        lines.push(`- **Transport Message ID**: \`${sc.liveProof.messageId}\``);
        lines.push(`- **Situation Record ID**: \`${sc.liveProof.situationId}\``);
        lines.push(`- **Sender**: \`${sc.liveProof.sender}\` ➔ **Receiver**: \`${sc.liveProof.receiver}\``);
        lines.push(`- **Preserved Graph Nodes**: ${sc.liveProof.graphNodeIds.join(", ")}`);
        lines.push(`- **Preserved Evidence Refs**: ${sc.liveProof.evidenceIds.join(", ")}`);
        lines.push(`- **Transport Receipt Timestamp**: \`${sc.liveProof.timestamp}\``);
      }
      lines.push("");
    }

    return lines.join("\n");
  }
}

