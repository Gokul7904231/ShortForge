/**
 * ShortForge / FactoryOS — ContextCompiler Implementation
 * Bounds evidence, redacts credentials, and emits a structured ContextCapsule.
 *
 * NOTE: ContextCompiler reduces unsupported model reasoning by supplying
 * bounded, ranked, provenance-backed evidence under strict token budgets.
 */

import * as crypto from "node:crypto";
import { EvidenceItem } from "../retrieval/RetrievalContracts";
import {
  ContextBudgetPolicy,
  ContextCapsule,
  ContextCapsuleV2,
  IContextCompiler,
} from "./ContextCapsuleContracts";

export class ContextCompiler implements IContextCompiler {
  private static DEFAULT_BUDGET: ContextBudgetPolicy = {
    maxTokens: 2500,
    compactSummaries: true,
  };

  // Comprehensive secret redaction covering 11 credential classes
  private static SECRET_REGEXES = [
    /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
    /AIzaSy[a-zA-Z0-9_\-]{20,40}/g, // Google API key
    /gsk_[a-zA-Z0-9]{20,60}/g, // Groq API key
    /clerk_[a-zA-Z0-9_\-]{16,50}/gi, // Clerk secret
    /(?:ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{16,}/g, // GitHub PATs (all prefixes)
    /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/g, // JWTs
    /AKIA[0-9A-Z]{16}/g, // AWS Access Key
    /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/g, // Full PEM Private Key Block
    /INTERNAL_API_SECRET_KEY(?:\s*=\s*[^\s]+)?/gi,
    /password\s*[:=]\s*["'][^"']+["']/gi,
  ];

  public sanitizeRecursive<T>(val: T): T {
    if (typeof val === "string") {
      return this.redactSecrets(val) as unknown as T;
    }
    if (Array.isArray(val)) {
      return val.map((item) => this.sanitizeRecursive(item)) as unknown as T;
    }
    if (val !== null && typeof val === "object") {
      const sanitizedObj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const sanitizedKey = this.redactSecrets(k);
        sanitizedObj[sanitizedKey] = this.sanitizeRecursive(v);
      }
      return sanitizedObj as unknown as T;
    }
    return val;
  }

  public compile(params: {
    taskId: string;
    query: string;
    evidenceItems: EvidenceItem[];
    currentState?: Record<string, unknown>;
    budgetPolicy?: Partial<ContextBudgetPolicy>;
  }): ContextCapsule {
    const policy: ContextBudgetPolicy = {
      ...ContextCompiler.DEFAULT_BUDGET,
      ...(params.budgetPolicy || {}),
    };

    const cleanQuery = this.redactSecrets(params.query);
    const cleanCurrentState = params.currentState ? this.sanitizeRecursive(params.currentState) : {};

    const relevantEntities = new Set<string>();
    const keyFacts: string[] = [];
    const decisions: string[] = [];
    const lessons: string[] = [];
    const recentChanges: string[] = [];
    const provenanceList: string[] = [];
    const conflicts: string[] = [];
    const unknowns: string[] = [];

    // 1. Deduplicate Evidence & Sanitize ALL Properties Recursively
    const seenEvidenceIds = new Set<string>();
    const dedupedItems: EvidenceItem[] = [];

    for (const item of params.evidenceItems) {
      if (seenEvidenceIds.has(item.id)) continue;
      seenEvidenceIds.add(item.id);

      // Redact secrets in title and snippet
      const sanitizedSnippet = this.redactSecrets(item.snippet);
      const sanitizedTitle = this.redactSecrets(item.titleOrPath);
      const sanitizedMetadata = item.metadata ? this.sanitizeRecursive(item.metadata) : undefined;

      const sanitizedItem: EvidenceItem = {
        ...item,
        titleOrPath: sanitizedTitle,
        snippet: sanitizedSnippet,
        metadata: sanitizedMetadata,
      };

      dedupedItems.push(sanitizedItem);
    }

    // 2. Classify into Semantic Categories
    for (const item of dedupedItems) {
      provenanceList.push(`${item.sourceType}:${item.titleOrPath}`);

      if (item.sourceType === "STRUCTURAL") {
        relevantEntities.add(item.titleOrPath);
        keyFacts.push(`[AST Symbol] ${item.snippet}`);
      } else if (item.sourceType === "KNOWLEDGE") {
        const fm = (item.metadata?.frontmatter as Record<string, unknown>) || {};
        const type = fm.type || "knowledge";
        if (type === "decision") {
          decisions.push(`[ADR: ${item.sourceId}] ${item.snippet}`);
        } else if (type === "lesson") {
          lessons.push(`[Lesson: ${item.sourceId}] ${item.snippet}`);
        } else {
          keyFacts.push(`[${type}] ${item.snippet}`);
        }
      } else if (item.sourceType === "HISTORY") {
        recentChanges.push(item.snippet);
      } else if (item.sourceType === "RUNTIME") {
        keyFacts.push(`[Runtime Truth] ${item.snippet}`);
      }
    }

    // 3. Detect Conflicts or Unknowns
    if (dedupedItems.length === 0) {
      unknowns.push(`No direct evidence found across structural AST, knowledge vault, or history for: "${cleanQuery}"`);
    }

    // Check for conflicting statuses
    for (const item of dedupedItems) {
      if (item.verification === "disputed") {
        conflicts.push(`Evidence ${item.id} has disputed verification status.`);
      }
    }

    // 4. Token Budget Allocation: Evidence first, then supplementary summary lists
    let wasTruncated = false;
    const maxTokens = policy.maxTokens;
    const reservedTokens = 35; // overhead for taskId, query, dates, keys

    // If currentState alone consumes > 25% of budget, compact it to essential operational signals
    let compactState = cleanCurrentState;
    if (Math.ceil(JSON.stringify(compactState).length / 4) > maxTokens * 0.25) {
      compactState = {
        factoryStatus: (cleanCurrentState as any).factoryStatus || "UNKNOWN",
        systemConfidence: (cleanCurrentState as any).systemConfidence,
        failedWorkers: Object.values((cleanCurrentState as any).workers || {}).filter(
          (w: any) => w.status === "FAILED" || w.status === "DEGRADED"
        ).length,
        activeCases: ((cleanCurrentState as any).activeCaseIds || []).length,
        _compacted: true,
      };
      wasTruncated = true;
    }

    const baseOverhead = reservedTokens + Math.ceil((cleanQuery.length + JSON.stringify(compactState).length) / 4);
    let currentTokens = baseOverhead;

    // A. Allocate evidence items first (up to 70% of maxTokens)
    const acceptedEvidence: EvidenceItem[] = [];
    const evidenceBudget = Math.floor(maxTokens * 0.70);

    for (const ev of dedupedItems) {
      const cleanSnippet = ev.snippet.length > 200 ? `${ev.snippet.slice(0, 197)}...` : ev.snippet;
      const strippedEv: EvidenceItem = {
        id: ev.id,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId,
        titleOrPath: ev.titleOrPath,
        snippet: cleanSnippet,
        relevance: ev.relevance,
        authority: ev.authority,
        freshness: ev.freshness,
        epistemicStatus: ev.epistemicStatus,
        verification: ev.verification,
      };
      const evCost = Math.ceil(JSON.stringify(strippedEv).length / 4);
      if (currentTokens + evCost <= maxTokens && (currentTokens - baseOverhead + evCost <= evidenceBudget || acceptedEvidence.length === 0)) {
        acceptedEvidence.push(strippedEv);
        currentTokens += evCost;
      } else if (acceptedEvidence.length === 0 && maxTokens - currentTokens > 40) {
        // Minimal compacted single evidence item
        const maxChars = Math.max(30, (maxTokens - currentTokens - 35) * 4);
        (strippedEv as any).snippet = `${strippedEv.snippet.slice(0, maxChars)}...`;
        const minCost = Math.ceil(JSON.stringify(strippedEv).length / 4);
        if (currentTokens + minCost <= maxTokens) {
          acceptedEvidence.push(strippedEv);
          currentTokens += minCost;
        }
        wasTruncated = true;
        break;
      } else {
        wasTruncated = true;
      }
    }

    // B. Fit supplementary summary lists with remaining tokens
    const boundedKeyFacts: string[] = [];
    const boundedDecisions: string[] = [];
    const boundedLessons: string[] = [];
    const boundedRecentChanges: string[] = [];
    const boundedConflicts: string[] = [];
    const boundedUnknowns: string[] = [];
    const boundedProvenance: string[] = [];

    const fitString = (str: string, list: string[]): boolean => {
      const cost = Math.ceil(str.length / 4) + 4;
      if (currentTokens + cost <= maxTokens) {
        list.push(str);
        currentTokens += cost;
        return true;
      }
      wasTruncated = true;
      return false;
    };

    for (const d of decisions) fitString(d, boundedDecisions);
    for (const l of lessons) fitString(l, boundedLessons);
    for (const k of keyFacts) fitString(k, boundedKeyFacts);
    for (const r of recentChanges) fitString(r, boundedRecentChanges);
    for (const c of conflicts) fitString(c, boundedConflicts);
    for (const u of unknowns) fitString(u, boundedUnknowns);
    for (const p of provenanceList) fitString(p, boundedProvenance);

    const capsule: ContextCapsule = {
      taskId: params.taskId,
      query: cleanQuery,
      currentState: compactState,
      relevantEntities: Array.from(relevantEntities),
      keyFacts: boundedKeyFacts,
      decisions: boundedDecisions,
      lessons: boundedLessons,
      recentChanges: boundedRecentChanges,
      evidence: acceptedEvidence,
      conflicts: boundedConflicts,
      unknowns: boundedUnknowns,
      provenance: boundedProvenance,
      budget: {
        maxTokens,
        estimatedTokens: currentTokens,
        wasTruncated,
      },
      compiledAt: new Date().toISOString(),
    };

    const sanitizedCapsule = this.sanitizeRecursive(capsule);

    // Final verification against serialized size
    let finalEstimatedTokens = Math.ceil(JSON.stringify(sanitizedCapsule).length / 4);
    if (finalEstimatedTokens > maxTokens) {
      (sanitizedCapsule.budget as any).wasTruncated = true;
      for (const ev of sanitizedCapsule.evidence) {
        delete (ev as any).metadata;
      }
      while (Math.ceil(JSON.stringify(sanitizedCapsule).length / 4) > maxTokens) {
        const overflowChars = (Math.ceil(JSON.stringify(sanitizedCapsule).length / 4) - maxTokens) * 4;
        if (sanitizedCapsule.evidence.length > 1) {
          sanitizedCapsule.evidence.pop();
        } else if (sanitizedCapsule.evidence.length === 1 && sanitizedCapsule.evidence[0].snippet.length > overflowChars + 15) {
          const ev: any = sanitizedCapsule.evidence[0];
          ev.snippet = `${ev.snippet.slice(0, Math.max(20, ev.snippet.length - overflowChars - 15))}...`;
        } else if (sanitizedCapsule.provenance.length > 0) {
          sanitizedCapsule.provenance.pop();
        } else if (sanitizedCapsule.relevantEntities.length > 0) {
          sanitizedCapsule.relevantEntities.pop();
        } else {
          break;
        }
      }
    }

    (sanitizedCapsule.budget as any).estimatedTokens = Math.ceil(JSON.stringify(sanitizedCapsule).length / 4);
    return sanitizedCapsule;
  }

  public redactSecrets(text: string): string {
    let sanitized = text;

    // 1. Structure-preserving Database URI credential redaction:
    // postgres://user:password@host:5432/db -> postgres://user:[REDACTED_SECRET]@host:5432/db
    sanitized = sanitized.replace(
      /((?:postgres|postgresql|mongodb|mysql):\/\/[^:]+:)[^@]+(@[^\s"']+)/gi,
      "$1[REDACTED_SECRET]$2"
    );

    // 2. Standard secret token regexes
    for (const rx of ContextCompiler.SECRET_REGEXES) {
      sanitized = sanitized.replace(rx, "[REDACTED_SECRET]");
    }

    return sanitized;
  }

  public canonicalizeJson(obj: unknown): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => this.canonicalizeJson(item)).join(",") + "]";
    }
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    const entries = keys.map(
      (k) => JSON.stringify(k) + ":" + this.canonicalizeJson((obj as Record<string, unknown>)[k])
    );
    return "{" + entries.join(",") + "}";
  }

  public computeFingerprint(data: unknown): string {
    return crypto.createHash("sha256").update(this.canonicalizeJson(data)).digest("hex");
  }

  public compileV2(params: {
    taskId: string;
    query: string;
    evidenceItems: EvidenceItem[];
    currentState?: Record<string, unknown>;
    stateVersion?: string;
    sourceVersions?: Record<string, string>;
    budgetPolicy?: Partial<ContextBudgetPolicy>;
  }): ContextCapsuleV2 {
    const baseCapsule = this.compile({
      taskId: params.taskId,
      query: params.query,
      evidenceItems: params.evidenceItems,
      currentState: params.currentState,
      budgetPolicy: params.budgetPolicy,
    });

    const stateFingerprint = this.computeFingerprint(params.currentState || {});
    const payload: Record<string, unknown> = {
      taskId: baseCapsule.taskId,
      query: baseCapsule.query,
      currentState: baseCapsule.currentState,
      relevantEntities: baseCapsule.relevantEntities,
      keyFacts: baseCapsule.keyFacts,
      decisions: baseCapsule.decisions,
      lessons: baseCapsule.lessons,
      recentChanges: baseCapsule.recentChanges,
      evidence: baseCapsule.evidence,
      conflicts: baseCapsule.conflicts,
      unknowns: baseCapsule.unknowns,
      provenance: baseCapsule.provenance,
    };

    const canonicalSerialized = this.canonicalizeJson(payload);
    const contextHash = crypto.createHash("sha256").update(canonicalSerialized).digest("hex");
    const estimatedTokens = Math.ceil(canonicalSerialized.length / 4);

    return {
      contextId: `ctx_${crypto.randomBytes(8).toString("hex")}`,
      contextVersion: 2,
      contextHash,
      stateVersion: params.stateVersion || "1.0.0",
      stateFingerprint,
      sourceVersions: params.sourceVersions || {},
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 300000).toISOString(),
      estimatedTokens,
      truncated: baseCapsule.budget.wasTruncated,
      redactionState: "CLEAN",
      payload,
    };
  }
}
