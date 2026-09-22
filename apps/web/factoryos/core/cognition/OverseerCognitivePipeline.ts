/**
 * FactoryOS Frontier v3 — Overseer Cognitive Pipeline
 * Implements the 4-Stage Operational Flow:
 * USER -> INTENT INTERPRETATION -> TRUTH CONTRACT -> DETERMINISTIC ROUTER -> AUTHORITATIVE SOURCE -> EVIDENCE RECORD -> COGNITIVE SYNTHESIS -> RESPONSE REVIEW -> USER
 */

import { OverseerCognitionProvider } from "./OverseerCognitionProvider";
import type {
  CognitiveIntent,
  IntentClassification,
  AnswerContract,
  ResponseReview,
} from "./CognitiveContracts";
import { EvidenceRecord, EvidenceFactory } from "../contracts/EvidenceRecord";
import { FactoryStateService } from "../state/FactoryStateService";
import { TrendResearchService } from "../research/TrendResearchService";
import { KnowledgeDocumentService } from "../rag/KnowledgeDocumentService";
import { MissionStateService } from "../missions/MissionStateService";
import { getUserQuota } from "@/lib/quota/quota-service";

export interface PipelineExecutionResult {
  intent: CognitiveIntent;
  answer: string;
  sourceUsed: string;
  evidence: Record<string, any>;
  evidenceRecord?: EvidenceRecord<any>;
  traces: Array<{
    stage: "INTENT" | "PLAN" | "TOOL_EXECUTION" | "SYNTHESIS" | "REVIEW";
    detail: string;
    timestamp: string;
  }>;
  review?: ResponseReview;
  clarificationRequired?: boolean;
  success?: boolean;
  error?: string;
  errorCode?: string;
}

export class OverseerCognitivePipeline {
  private cognitive: OverseerCognitionProvider;
  private factoryState: FactoryStateService;
  private trendResearch: TrendResearchService;
  private knowledgeDocs: KnowledgeDocumentService;
  private missionState: MissionStateService;

  constructor(provider?: OverseerCognitionProvider) {
    this.cognitive = provider || new OverseerCognitionProvider();
    this.factoryState = FactoryStateService.getInstance();
    this.trendResearch = TrendResearchService.getInstance();
    this.knowledgeDocs = KnowledgeDocumentService.getInstance();
    this.missionState = MissionStateService.getInstance();
  }

  /**
   * Main end-to-end cognitive execution pipeline
   */
  async processUserQuery(
    message: string,
    context: {
      userId: string;
      userRole: string;
      recentMessages?: string[];
      worldState?: any;
    }
  ): Promise<PipelineExecutionResult> {
    const traces: PipelineExecutionResult["traces"] = [];

    // Stage 1: Cognitive Intent Interpretation
    const classification: IntentClassification = await this.cognitive.classify(
      message,
      context.recentMessages || []
    );

    traces.push({
      stage: "INTENT",
      detail: `Classified as ${classification.intent} (Confidence: ${classification.confidence}, SourceClass: ${classification.sourceClass})`,
      timestamp: new Date().toISOString(),
    });

    if (classification.clarificationRequired) {
      const prompt = classification.clarificationPrompt || "Could you clarify which specific task or video you'd like me to assist with?";
      return {
        intent: "CLARIFICATION_REQUIRED",
        answer: prompt,
        sourceUsed: "COGNITIVE_CLARIFICATION",
        evidence: {},
        traces,
        clarificationRequired: true,
      };
    }

    // Stage 2: Establish Source of Truth & Answer Contract
    const contract: AnswerContract = this.buildAnswerContract(message, classification);

    // Stage 3: Deterministic Source Execution (Never let cognitive model invent state)
    const { sourceUsed, evidence, toolOutputs, evidenceRecord } = await this.executeAuthoritativeSource(
      classification,
      context
    );

    traces.push({
      stage: "TOOL_EXECUTION",
      detail: `Retrieved authoritative evidence from ${sourceUsed} [State: ${evidenceRecord?.state || "SUCCESS"}]`,
      timestamp: new Date().toISOString(),
    });

    // Stage 4: Cognitive Evidence Synthesis
    let answer = "";
    try {
      answer = await this.cognitive.synthesize(message, contract, evidence, toolOutputs);
    } catch (err: any) {
      traces.push({
        stage: "SYNTHESIS",
        detail: `Synthesis failed: ${err.message}`,
        timestamp: new Date().toISOString(),
      });
      return {
        intent: classification.intent,
        answer: "Overseer is currently unable to reach its reasoning service.",
        sourceUsed: "COGNITIVE_ERROR",
        evidence,
        evidenceRecord,
        traces,
        clarificationRequired: false,
        success: false,
        error: err.message,
        errorCode: err.errorCode || "PROVIDER_UNAVAILABLE",
      };
    }

    traces.push({
      stage: "SYNTHESIS",
      detail: `Synthesized grounded answer from authoritative source`,
      timestamp: new Date().toISOString(),
    });

    // Stage 5: Response Review (Max 1 controlled rewrite)
    try {
      const review = await this.cognitive.review(message, answer, evidence, contract);
      if (review.shouldRewrite && review.rewriteGuidance) {
        traces.push({
          stage: "REVIEW",
          detail: `Rewriting response due to review guidance: ${review.rewriteGuidance}`,
          timestamp: new Date().toISOString(),
        });
        answer = await this.cognitive.synthesize(
          `${message} (Guidance: ${review.rewriteGuidance})`,
          contract,
          evidence,
          toolOutputs
        );
      } else {
        traces.push({
          stage: "REVIEW",
          detail: `Review passed: topicAdherent=${review.topicAdherent}, factuallyGrounded=${review.factuallyGrounded}`,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        intent: classification.intent,
        answer,
        sourceUsed,
        evidence,
        evidenceRecord,
        traces,
        review,
        clarificationRequired: false,
        success: true,
      };
    } catch {
      return {
        intent: classification.intent,
        answer,
        sourceUsed,
        evidence,
        evidenceRecord,
        traces,
        clarificationRequired: false,
        success: true,
      };
    }
  }

  private buildAnswerContract(message: string, classification: IntentClassification): AnswerContract {
    switch (classification.intent) {
      case "FACTORY_TELEMETRY":
        return {
          userQuestion: message,
          intent: "FACTORY_TELEMETRY",
          requiredFacts: ["floorCount", "healthyFloors", "systemState"],
          source: "FactoryStateService",
          maximumScope: "direct",
          responseStyle: "concise",
          evidenceRequired: true,
        };
      case "CURRENT_TREND":
        return {
          userQuestion: message,
          intent: "CURRENT_TREND",
          requiredFacts: ["topTrend", "whyItMatters", "sources"],
          source: "TrendResearchService",
          freshness: "today",
          maximumScope: "research_summary",
          responseStyle: "concise_with_sources",
          evidenceRequired: true,
        };
      case "DOCUMENT_LOOKUP":
        return {
          userQuestion: message,
          intent: "DOCUMENT_LOOKUP",
          requiredFacts: ["documentContent", "ruleExcerpt"],
          source: "KnowledgeDocumentService",
          maximumScope: "direct",
          responseStyle: "concise",
          evidenceRequired: true,
        };
      case "QUOTA":
        return {
          userQuestion: message,
          intent: "QUOTA",
          requiredFacts: ["creditsRemaining", "planTier", "limit"],
          source: "QuotaService",
          maximumScope: "direct",
          responseStyle: "concise",
          evidenceRequired: true,
        };
      case "VIDEO_STATUS":
        return {
          userQuestion: message,
          intent: "VIDEO_STATUS",
          requiredFacts: ["activeMissionsCount", "completedVideosCount", "latestMission"],
          source: "MissionStateService",
          maximumScope: "operational_status",
          responseStyle: "concise",
          evidenceRequired: true,
        };
      default:
        return {
          userQuestion: message,
          intent: classification.intent,
          requiredFacts: [],
          source: "generalCognition",
          maximumScope: "direct",
          responseStyle: "conversational",
          evidenceRequired: false,
        };
    }
  }

  /**
   * Deterministic authoritative source execution.
   */
  private async executeAuthoritativeSource(
    classification: IntentClassification,
    context: { userId: string; userRole: string }
  ): Promise<{
    sourceUsed: string;
    evidence: Record<string, any>;
    toolOutputs: Record<string, any>;
    evidenceRecord: EvidenceRecord<any>;
  }> {
    switch (classification.intent) {
      case "FACTORY_TELEMETRY": {
        const ev = await this.factoryState.getLiveFactoryTelemetry();
        return {
          sourceUsed: "FactoryStateService",
          evidence: {
            floorCount: ev.data.floorCount,
            healthyFloors: ev.data.healthyFloors,
            systemState: ev.data.systemState,
            floors: ev.data.floors.map(f => f.name),
            cpuUsagePct: ev.data.systemLoad.cpuUsagePct,
            status: ev.data.systemState === "HEALTHY" ? "ONLINE" : ev.data.systemState,
          },
          toolOutputs: {
            floorCount: ev.data.floorCount,
            activeWorkers: ev.data.floors.reduce((acc, f) => acc + f.activeWorkers, 0),
          },
          evidenceRecord: ev,
        };
      }

      case "CURRENT_TREND": {
        const ev = await this.trendResearch.conductLiveResearch();
        if (ev.state === "SUCCESS" && ev.data) {
          return {
            sourceUsed: "TrendResearchService:LiveResearch",
            evidence: {
              category: ev.data.category,
              topTrend: ev.data.topic,
              whyItMatters: ev.data.summary,
              freshness: ev.data.freshness,
              sources: ev.data.citations.map(c => c.title || c.url),
            },
            toolOutputs: {
              verifiedDate: new Date().toISOString().split("T")[0],
            },
            evidenceRecord: ev,
          };
        }

        // Truthful fallback when live search is unavailable
        const unavailableEv = EvidenceFactory.create(
          "WEB_RESEARCH",
          "TrendResearchService",
          "UNAVAILABLE",
          {},
          { error: "Live trend data unavailable at this moment." }
        );

        return {
          sourceUsed: "TrendResearchService:Unavailable",
          evidence: {
            status: "UNAVAILABLE",
            message: "I couldn't verify today's live trend data right now because the live research service is unreachable.",
          },
          toolOutputs: { available: false },
          evidenceRecord: unavailableEv,
        };
      }

      case "DOCUMENT_LOOKUP": {
        const ev = await this.knowledgeDocs.lookupDocument("brand guide");
        if (ev.state === "SUCCESS" && ev.data) {
          return {
            sourceUsed: `KnowledgeDocumentService:${ev.data.docId}`,
            evidence: {
              title: ev.data.title,
              content: ev.data.contentExcerpt,
              sourcePath: ev.data.sourcePath,
            },
            toolOutputs: { ofkRef: ev.data.docId },
            evidenceRecord: ev,
          };
        }

        const emptyEv = EvidenceFactory.create(
          "DOCUMENT",
          "KnowledgeDocumentService",
          "EMPTY",
          {},
          { error: "No matching .ofk knowledge document found in workspace." }
        );

        return {
          sourceUsed: "KnowledgeDocumentService:Empty",
          evidence: {
            title: "Document Not Found",
            content: "No matching knowledge document or style guide exists in the local .ofk knowledge repository.",
          },
          toolOutputs: { found: false },
          evidenceRecord: emptyEv,
        };
      }

      case "QUOTA": {
        try {
          const quota = await getUserQuota(context.userId || "anonymous", context.userRole || "VIEWER");
          const ev = EvidenceFactory.create(
            "QUOTA",
            "QuotaService:Firestore",
            "SUCCESS",
            quota,
            {
              claims: [
                `Completed: ${quota.completed}/${quota.limit}`,
                `Remaining: ${quota.remaining}`,
              ]
            }
          );

          return {
            sourceUsed: "QuotaService",
            evidence: {
              tier: quota.isUnlimited ? "ADMIN_UNLIMITED" : "CREATOR_BASIC",
              rendersRemainingToday: quota.remaining,
              completedVideos: quota.completed,
              activeJobs: quota.reserved,
              spendCapUsd: 0.00,
            },
            toolOutputs: { allowed: !quota.isExceeded },
            evidenceRecord: ev,
          };
        } catch {
          const ev = EvidenceFactory.create(
            "QUOTA",
            "QuotaService",
            "UNAVAILABLE",
            {},
            { error: "Quota service could not query Firestore state." }
          );

          return {
            sourceUsed: "QuotaService:Unavailable",
            evidence: {
              status: "UNAVAILABLE",
              rendersRemainingToday: "Unavailable",
              activeJobs: 0,
            },
            toolOutputs: { allowed: true },
            evidenceRecord: ev,
          };
        }
      }

      case "VIDEO_STATUS": {
        const ev = await this.missionState.getUserMissionStatus(context.userId);
        return {
          sourceUsed: "MissionStateService",
          evidence: {
            activeMissions: ev.data.activeMissionsCount,
            completedVideos: ev.data.completedVideosCount,
            latestStatus: ev.data.latestMission?.status || "NO_ACTIVE_JOBS",
            latestTitle: ev.data.latestMission?.title,
          },
          toolOutputs: { activeCount: ev.data.activeMissionsCount },
          evidenceRecord: ev,
        };
      }

      default: {
        const genEv = EvidenceFactory.create("SYSTEM", "GeneralCognition", "SUCCESS", {});
        return {
          sourceUsed: "GeneralCognition",
          evidence: {},
          toolOutputs: {},
          evidenceRecord: genEv,
        };
      }
    }
  }
}
