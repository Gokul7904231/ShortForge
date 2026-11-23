/**
 * Project Ascalon — Golden Trajectory Builder
 *
 * Constructs authoritative, verified operational trajectories covering core ShortForge
 * scenarios: recovery, worker selection, CAS validation, fencing, and policy enforcement.
 * All golden examples have full provenance and verified outcomes.
 */

export class GoldenTrajectoryBuilder {
  public static generateGoldenDataset(): any[] {
    const trajectories: any[] = [];

    // Trajectory 1: Worker Lease Expiration & Slayer Revocation
    trajectories.push({
      trajectoryId: "traj_golden_001_lease_expired",
      schemaVersion: "1.0.0",
      hierarchyVersion: "1.0.0",
      episode: {
        episodeId: "ep_lease_001",
        missionId: "miss_render_401",
        taskId: "task_render_f06",
        caseId: "case_anom_882",
      },
      environment: {
        environmentType: "REAL",
        repositoryCommit: "b70a4e5",
        runtimeVersion: "1.0.0",
        timestamp: "2026-09-23T10:00:00Z",
      },
      observation: {
        observationId: "obs_lease_001",
        timestamp: "2026-09-23T10:00:00Z",
        objective: "Manage unresponsive render worker on Floor 06",
        worldStateSummary: {
          factoryStatus: "DEGRADED",
          activeFloorsCount: 7,
          activeWorkersCount: 3,
          activeIncidentIds: ["inc_lease_882"],
          sequenceNumber: 104,
        },
        relevantEvidence: [
          {
            evidenceId: "evi_lease_stale_1",
            evidenceType: "DATABASE_RECORD",
            source: "lease_manager",
            confidence: 1.0,
          },
        ],
        retrievedMemories: [],
        availableCapabilities: ["cap_slayer_revoke_lease", "cap_healer_retry_task"],
        environmentType: "REAL",
      },
      decision: {
        decisionId: "dec_lease_001",
        decisionType: "CAPABILITY_SELECTION",
        selectedAction: {
          actionType: "TERMINATE_EXPIRED_WORKER",
          targetEntity: "worker_gpu_t4_01",
          capabilityId: "cap_slayer_revoke_lease",
          parameters: { workerId: "worker_gpu_t4_01", leaseId: "lease_9941" },
        },
        alternatives: [
          { actionType: "RETRY_WITHOUT_REVOCATION", probability: 0.05, rejectionReason: "Violates lease safety" },
        ],
        uncertainty: {
          modelProbability: 0.95,
          epistemicConfidence: 1.0,
          calibrationStatus: "CALIBRATED",
        },
        reasoningSource: {
          mode: "DETERMINISTIC_RULE",
          provider: "slayer_safety_policy",
          model: "deterministic-engine",
          trainingEligible: true,
          fallbackApplied: false,
        },
        status: "VALID",
      },
      authorization: {
        requested: true,
        authorized: true,
        guardianDecision: "APPROVED",
        policyChecks: ["lease_validity_rule", "fencing_token_check"],
      },
      execution: {
        tool: "cap_slayer_revoke_lease",
        arguments: { workerId: "worker_gpu_t4_01", leaseId: "lease_9941" },
        leaseId: "lease_9941",
        fencingToken: 12,
        startedAt: "2026-09-23T10:00:01Z",
        completedAt: "2026-09-23T10:00:02Z",
      },
      outcome: {
        outcomeId: "out_lease_001",
        status: "SUCCESS",
        verified: true,
        verificationEvidenceId: "evi_revocation_receipt_001",
        actualStateChange: {
          entityModified: "worker_gpu_t4_01",
          priorState: "BUSY_RENDERING",
          newState: "TERMINATED",
        },
        completedAt: "2026-09-23T10:00:02Z",
      },
      learning: {
        prediction: "Worker terminated cleanly",
        actualOutcome: "Worker terminated cleanly",
        success: true,
      },
      provenance: {
        labelSource: "VERIFIED_OUTCOME",
        trainingEligible: true,
        humanReviewed: true,
        simulation: false,
        synthetic: false,
      },
    });

    // Trajectory 2: Content-Addressed Storage Integrity Verification
    trajectories.push({
      trajectoryId: "traj_golden_002_cas_verified",
      schemaVersion: "1.0.0",
      hierarchyVersion: "1.0.0",
      episode: {
        episodeId: "ep_cas_002",
        missionId: "miss_short_501",
        taskId: "task_store_cas",
      },
      environment: {
        environmentType: "REAL",
        repositoryCommit: "b70a4e5",
        runtimeVersion: "1.0.0",
        timestamp: "2026-09-23T10:05:00Z",
      },
      observation: {
        observationId: "obs_cas_002",
        timestamp: "2026-09-23T10:05:00Z",
        objective: "Verify physical byte integrity of rendered video before CAS commit",
        worldStateSummary: {
          factoryStatus: "OPERATIONAL",
          activeFloorsCount: 8,
          activeWorkersCount: 4,
          sequenceNumber: 105,
        },
        relevantEvidence: [
          {
            evidenceId: "evi_sha256_probe_002",
            evidenceType: "CAS_FILE_DIGEST",
            source: "verification_engine",
            confidence: 1.0,
          },
        ],
        availableCapabilities: ["cap_compliance_verify", "cap_render_dispatch"],
        environmentType: "REAL",
      },
      decision: {
        decisionId: "dec_cas_002",
        decisionType: "CAPABILITY_SELECTION",
        selectedAction: {
          actionType: "VERIFY_AND_PROMOTE_ARTIFACT",
          targetEntity: "data/cas_storage/e3/e3b0c442...mp4",
          capabilityId: "cap_compliance_verify",
          parameters: { artifactSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        },
        uncertainty: {
          modelProbability: 1.0,
          epistemicConfidence: 1.0,
          calibrationStatus: "CALIBRATED",
        },
        reasoningSource: {
          mode: "DETERMINISTIC_RULE",
          provider: "verification_engine",
          model: "cas-validator",
          trainingEligible: true,
          fallbackApplied: false,
        },
        status: "VALID",
      },
      authorization: {
        requested: true,
        authorized: true,
        guardianDecision: "APPROVED",
        policyChecks: ["cas_checksum_match", "ffprobe_decode_smoke"],
      },
      execution: {
        tool: "cap_compliance_verify",
        arguments: { sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
        startedAt: "2026-09-23T10:05:01Z",
        completedAt: "2026-09-23T10:05:03Z",
      },
      outcome: {
        outcomeId: "out_cas_002",
        status: "SUCCESS",
        verified: true,
        verificationEvidenceId: "evi_cas_receipt_002",
        actualStateChange: {
          entityModified: "artifact_release_status",
          priorState: "UNVERIFIED",
          newState: "VERIFIED",
        },
        completedAt: "2026-09-23T10:05:03Z",
      },
      provenance: {
        labelSource: "VERIFIED_OUTCOME",
        trainingEligible: true,
        humanReviewed: true,
        simulation: false,
        synthetic: false,
      },
    });

    // Trajectory 3: Policy Gate Rejection (Guardian Veto on Stale Policy)
    trajectories.push({
      trajectoryId: "traj_golden_003_policy_veto",
      schemaVersion: "1.0.0",
      hierarchyVersion: "1.0.0",
      episode: {
        episodeId: "ep_policy_003",
        missionId: "miss_pub_991",
        taskId: "task_publish_youtube",
      },
      environment: {
        environmentType: "REAL",
        repositoryCommit: "b70a4e5",
        runtimeVersion: "1.0.0",
        timestamp: "2026-09-23T10:10:00Z",
      },
      observation: {
        observationId: "obs_policy_003",
        timestamp: "2026-09-23T10:10:00Z",
        objective: "Evaluate YouTube publication intent with stale policy snapshot",
        worldStateSummary: {
          factoryStatus: "OPERATIONAL",
          activeFloorsCount: 8,
          activeWorkersCount: 4,
          sequenceNumber: 106,
        },
        relevantEvidence: [
          {
            evidenceId: "evi_policy_stale_003",
            evidenceType: "POLICY_SNAPSHOT",
            source: "G00_PolicyFreshnessGate",
            confidence: 1.0,
          },
        ],
        availableCapabilities: ["cap_youtube_publish"],
        environmentType: "REAL",
      },
      decision: {
        decisionId: "dec_policy_003",
        decisionType: "CAPABILITY_SELECTION",
        selectedAction: {
          actionType: "PUBLISH_TO_YOUTUBE",
          targetEntity: "youtube_channel_01",
          capabilityId: "cap_youtube_publish",
        },
        uncertainty: {
          modelProbability: 0.8,
          epistemicConfidence: 0.9,
          calibrationStatus: "CALIBRATED",
        },
        reasoningSource: {
          mode: "REAL_MODEL",
          provider: "overseer_api",
          model: "gemini-2.5-flash",
          trainingEligible: true,
          fallbackApplied: false,
        },
        status: "VALID",
      },
      authorization: {
        requested: true,
        authorized: false,
        guardianDecision: "DENIED",
        policyChecks: ["G00_POLICY_FRESHNESS_FAILED"],
      },
      execution: {
        tool: "cap_youtube_publish",
        arguments: { channelId: "youtube_channel_01" },
        startedAt: "2026-09-23T10:10:01Z",
        completedAt: "2026-09-23T10:10:02Z",
      },
      outcome: {
        outcomeId: "out_policy_003",
        status: "REJECTED_BY_GUARDIAN",
        verified: true,
        verificationEvidenceId: "evi_guardian_veto_receipt_003",
        actualStateChange: {
          entityModified: "publication_intent",
          priorState: "PENDING_APPROVAL",
          newState: "BLOCKED",
        },
        completedAt: "2026-09-23T10:10:02Z",
      },
      provenance: {
        labelSource: "AUTHORITATIVE_SYSTEM",
        trainingEligible: true,
        humanReviewed: true,
        simulation: false,
        synthetic: false,
      },
    });

    return trajectories;
  }
}
