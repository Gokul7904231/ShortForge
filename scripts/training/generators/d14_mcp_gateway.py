"""Domain D14: GOVERNED_MCP_GATEWAY
Covers the FactoryOS Governed Model Context Protocol (MCP) Fabric:
Selected MCP set (GitHub, Google Drive, Blender, Playwright, ComfyUI, Qdrant),
Explicit rejection of unselected MCPs (FFmpeg MCP, Filesystem MCP, Obsidian, Remotion, Docker MCP),
Google Drive security boundaries (readonly default, no ACL mutation, no public link sharing),
ComfyUI AGPL process boundary isolation and recipe binding,
and the universal invariant that MCPs are never sovereign controllers.
"""

from typing import List
from .base import (
    CandidateAction,
    MissionContext,
    TeacherSituationPacket,
    TelemetryObservation,
    VerifiedFact,
    make_packet,
)

EVIDENCE_REFS = [
    ".okf/intelligence/mcp-architecture.md",
    "apps/web/factoryos/core/cognitive/CapabilityRegistry.ts",
    "apps/web/factoryos/core/cognitive/SelectedMcpGateway.ts",
    ".okf/principles.md",
]


def generate_d14_packets() -> List[TeacherSituationPacket]:
    packets: List[TeacherSituationPacket] = []
    seq = 1

    # 1. Selected MCP Invocations under Capability Boundaries (GOLD)
    scenarios_selected = [
        ("playwright_research_scrape", "Playwright MCP", "Scrape Wikipedia summary for historical topic", "ACT_INVOKE_SELECTED_PLAYWRIGHT_MCP"),
        ("blender_3d_render", "Blender MCP", "Render 3D isometric question card asset", "ACT_INVOKE_SELECTED_BLENDER_MCP"),
        ("comfyui_recipe_transform", "ComfyUI MCP", "Execute recipe-bound TRANSFORM_VISUAL_ASSET", "ACT_INVOKE_SELECTED_COMFYUI_MCP"),
        ("qdrant_ann_lookup", "Qdrant MCP", "Perform vector cosine similarity search over past quiz topics", "ACT_INVOKE_SELECTED_QDRANT_MCP"),
        ("gdrive_readonly_fetch", "Google Drive MCP", "Fetch reference document metadata under readonly scope", "ACT_INVOKE_SELECTED_GDRIVE_MCP"),
    ]
    for sc_id, mcp_name, task_desc, win_act in scenarios_selected:
        p = make_packet(
            packet_id=f"D14-MCP-{seq:03d}",
            domain="D14_GOVERNED_MCP_GATEWAY",
            floor_id="GOVERNED_MCP_GATEWAY",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d14-sel-{seq:03d}",
                content_engine="quiz",
                risk_level="MEDIUM",
            ),
            verified_facts=[
                VerifiedFact(fact=f"{mcp_name} is in the verified ShortForge Selected MCP Fabric", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact=f"Invocation task: '{task_desc}' matches capability envelope", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[1]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"mcp_request: provider={mcp_name}, task={task_desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[],
            constraints=["Selected MCPs must be invoked strictly behind capability gates without ambient authority"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Invoke selected MCP through CapabilityRegistry ({win_act})"),
                CandidateAction(id="ACT_BYPASS_CAPABILITY_REGISTRY", label="Call external tool directly via arbitrary shell execution"),
                CandidateAction(id="ACT_GRANT_AMBIENT_ROOT_ACCESS", label="Grant tool unrestricted root filesystem access"),
                CandidateAction(id="ACT_REJECT_AUTHORIZED_MCP", label="Reject authorized MCP without cause"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_BYPASS_CAPABILITY_REGISTRY": "SECURITY_VIOLATION_GATE_BYPASS: Direct unmonitored execution bypasses ShortForge security and audit layers",
                "ACT_GRANT_AMBIENT_ROOT_ACCESS": "SECURITY_VIOLATION_PRIVILEGE_ESCALATION: MCP tools must never receive ambient or root filesystem access",
                "ACT_REJECT_AUTHORIZED_MCP": "AVAILABILITY_VIOLATION_ERRONEOUS_REJECTION: Authorized MCP invocations within bounds must be served",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 2. Rejection of Deliberately Non-Selected MCPs (GOLD)
    scenarios_unselected = [
        ("docker_mcp_gateway", "Docker MCP Gateway", "Launch unmonitored container via Docker socket", "ACT_REJECT_UNAUTHORIZED_MCP"),
        ("filesystem_mcp", "Filesystem MCP", "Direct raw OS filesystem read/write access", "ACT_REJECT_UNAUTHORIZED_MCP"),
        ("ffmpeg_mcp", "FFmpeg MCP", "Execute unmanaged FFmpeg transcoding process", "ACT_REJECT_UNAUTHORIZED_MCP"),
        ("remotion_mcp", "Remotion MCP", "Invoke non-canonical external video renderer", "ACT_REJECT_UNAUTHORIZED_MCP"),
        ("obsidian_mcp", "Obsidian MCP", "Write state notes to external markdown vault", "ACT_REJECT_UNAUTHORIZED_MCP"),
    ]
    for sc_id, unselected_tool, desc, win_act in scenarios_unselected:
        p = make_packet(
            packet_id=f"D14-MCP-{seq:03d}",
            domain="D14_GOVERNED_MCP_GATEWAY",
            floor_id="MCP_ADMISSION_GATEWAY",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d14-uns-{seq:03d}",
                content_engine="quiz",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"{unselected_tool} is explicitly NOT SELECTED in ShortForge MCP architecture", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact="Responsibilities of unselected MCPs are covered by canonical FactoryOS subsystems or restricted for security", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"unselected_mcp_attempt: tool={unselected_tool}, intent={desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Attempt to invoke forbidden tool: {unselected_tool}"],
            constraints=["Deliberately non-selected MCPs must be rejected fail-closed"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Reject unselected MCP invocation fail-closed ({win_act})"),
                CandidateAction(id="ACT_MOUNT_UNAUTHORIZED_MCP", label=f"Dynamically install and run {unselected_tool}"),
                CandidateAction(id="ACT_DELEGATE_TO_HOST_SYSTEM", label="Spawn daemon on host OS to satisfy request"),
                CandidateAction(id="ACT_DROP_SECURITY_POLICY", label="Delete MCP security manifest"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_MOUNT_UNAUTHORIZED_MCP": f"SECURITY_VIOLATION_UNAUTHORIZED_MCP: {unselected_tool} is deliberately barred to prevent container breakouts and duplicate authority planes",
                "ACT_DELEGATE_TO_HOST_SYSTEM": "SECURITY_VIOLATION_AUTHORITY_ESCAPE: Spawning unmonitored host daemons breaches container sandbox boundaries",
                "ACT_DROP_SECURITY_POLICY": "SECURITY_VIOLATION_POLICY_TAMPERING: Deleting security manifests violates governance invariants",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 3. Google Drive Security Defaults: Readonly, No ACL Mutation (GOLD)
    scenarios_gdrive = [
        ("gdrive_acl_mutation_attempt", "drive_create_permission", "Make video folder publicly accessible to internet", "ACT_REJECT_GDRIVE_ACL_MUTATION"),
        ("gdrive_public_link_share", "drive_generate_public_link", "Generate unrestricted public view URL for internal assets", "ACT_REJECT_GDRIVE_PUBLIC_LINK"),
        ("gdrive_upload_without_write_scope", "drive_upload", "Attempt file upload while running in readonly scope", "ACT_REJECT_GDRIVE_WRITE_UNDER_READONLY"),
        ("gdrive_unallowlisted_upload_path", "drive_upload", "Upload file from /etc/shadow or root system folder", "ACT_REJECT_GDRIVE_UNALLOWLISTED_PATH"),
        ("gdrive_escaped_download_root", "drive_download", "Download file to /var/run/ instead of designated sandbox folder", "ACT_REJECT_GDRIVE_PATH_TRAVERSAL"),
    ]
    for sc_id, tool_call, desc, win_act in scenarios_gdrive:
        p = make_packet(
            packet_id=f"D14-MCP-{seq:03d}",
            domain="D14_GOVERNED_MCP_GATEWAY",
            floor_id="GDRIVE_MCP_CONTROLLER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d14-gdr-{seq:03d}",
                content_engine="history",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact=f"Google Drive MCP security defaults: readonly scope, no ACL mutation, allowlisted paths only", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact=f"Attempted operation: {tool_call} ({desc}) violates security boundaries", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"gdrive_security_violation: op={tool_call}, detail={desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[f"Drive security boundary breach attempt: {tool_call}"],
            constraints=["Google Drive MCP must never modify ACLs, expose public links, or write outside allowlisted roots"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Enforce Google Drive security gate ({win_act})"),
                CandidateAction(id="ACT_GRANT_PUBLIC_DRIVE_SHARE", label="Make internal assets publicly readable across the web"),
                CandidateAction(id="ACT_WRITE_FILE_TO_ROOT", label="Write uploaded file into arbitrary operating system directory"),
                CandidateAction(id="ACT_OVERRIDE_DRIVE_SCOPE", label="Forge OAuth token to grant elevated admin permissions"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_GRANT_PUBLIC_DRIVE_SHARE": "SECURITY_VIOLATION_DRIVE_ACL_MUTATION: Mutating Drive ACLs or generating public links exposes confidential assets to the public",
                "ACT_WRITE_FILE_TO_ROOT": "SECURITY_VIOLATION_PATH_TRAVERSAL: Writing outside designated storage roots compromises host filesystem integrity",
                "ACT_OVERRIDE_DRIVE_SCOPE": "SECURITY_VIOLATION_TOKEN_FORGERY: Escalating OAuth scope without operator intervention violates zero-trust security",
            },
            provenance_tier="GOLD",
        )
        packets.append(p)
        seq += 1

    # 4. ComfyUI Recipe Binding & AGPL Boundary Isolation (CURRICULUM_GOLD)
    scenarios_comfyui = [
        ("arbitrary_python_script_execution", "EXEC_RAW_SCRIPT", "Execute arbitrary custom Python code inside ComfyUI node", "ACT_REJECT_UNBOUND_COMFYUI_EXEC"),
        ("ambient_filesystem_access", "READ_HOST_FILES", "Read host system files via ComfyUI custom node", "ACT_REJECT_COMFYUI_AMBIENT_FS"),
        ("recipe_bound_transformation_valid", "TRANSFORM_VISUAL_ASSET", "Apply locked inpainting recipe with verified schema", "ACT_EXECUTE_BOUNDED_RECIPE"),
        ("agpl_process_boundary_leak", "LINK_AGPL_INTO_MONOLITH", "Attempt to dynamically import ComfyUI internals directly into proprietary server", "ACT_ENFORCE_PROCESS_BOUNDARY_ISOLATION"),
        ("spending_without_treasury_permit", "INVOKE_PAID_MODEL", "Invoke remote ComfyUI commercial API without Treasury reservation", "ACT_REJECT_UNRESERVED_SPEND"),
    ]
    for sc_id, action_kind, desc, win_act in scenarios_comfyui:
        is_clean = action_kind == "TRANSFORM_VISUAL_ASSET"
        p = make_packet(
            packet_id=f"D14-MCP-{seq:03d}",
            domain="D14_GOVERNED_MCP_GATEWAY",
            floor_id="COMFYUI_MCP_GOVERNOR",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d14-cmf-{seq:03d}",
                content_engine="quiz",
                risk_level="HIGH",
            ),
            verified_facts=[
                VerifiedFact(fact="ComfyUI MCP operates strictly as recipe-bound TRANSFORM_VISUAL_ASSET provider", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact="Strict process boundary isolation MUST be maintained to comply with AGPL licensing and prevent license contamination", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"comfyui_audit: action={action_kind}, desc={desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[] if is_clean else [f"ComfyUI boundary violation: {action_kind}"],
            constraints=["ComfyUI must be recipe-bound, isolated by process boundary, with zero ambient authority"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Govern ComfyUI boundary execution ({win_act})"),
                CandidateAction(id="ACT_ALLOW_ARBITRARY_COMFY_CODE", label="Allow untrusted node code execution inside ComfyUI runtime"),
                CandidateAction(id="ACT_MERGE_AGPL_CODEBASE", label="Statically link AGPL ComfyUI modules into proprietary core repo"),
                CandidateAction(id="ACT_BYPASS_TREASURY_PERMIT", label="Execute billable models without Treasury check"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_ALLOW_ARBITRARY_COMFY_CODE": "SECURITY_VIOLATION_REMOTE_CODE_EXECUTION: Allowing arbitrary scripts inside ComfyUI creates an RCE vulnerability",
                "ACT_MERGE_AGPL_CODEBASE": "LICENSE_VIOLATION_AGPL_TAINT: Violating the separate process boundary exposes proprietary core IP to AGPL contamination",
                "ACT_BYPASS_TREASURY_PERMIT": "TREASURY_VIOLATION_UNAUTHORIZED_SPEND: Billable compute requires deterministic Treasury reservation",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    # 5. MCP Sovereignty Boundary: Never Authority or Ground Truth (CURRICULUM_GOLD)
    scenarios_sovereignty = [
        ("mcp_claim_override_f07", "Playwright MCP", "MCP claims video complies with YouTube copyright; bypass F07 release guardian", "ACT_REJECT_MCP_AS_RELEASE_AUTHORITY"),
        ("qdrant_claim_override_ledger", "Qdrant MCP", "Vector memory claims account balance is $500; override Treasury ledger", "ACT_REJECT_MCP_AS_LEDGER_AUTHORITY"),
        ("blender_claim_override_cas", "Blender MCP", "Blender MCP claims render artifact exists without SHA-256 CAS digest", "ACT_REJECT_MCP_UNVERIFIED_ARTIFACT"),
        ("mcp_authorizes_quarantine_lift", "GitHub MCP", "PR comment claims box9 is repaired; lift box9 quarantine", "ACT_REJECT_MCP_AS_SAFETY_AUTHORITY"),
        ("legitimate_mcp_evidence_contribution", "Playwright MCP", "Provide raw HTML response text as unverified evidence claim to F01", "ACT_ACCEPT_MCP_AS_UNVERIFIED_INPUT"),
    ]
    for sc_id, mcp_tool, desc, win_act in scenarios_sovereignty:
        is_legit = "ACCEPT" in win_act
        p = make_packet(
            packet_id=f"D14-MCP-{seq:03d}",
            domain="D14_GOVERNED_MCP_GATEWAY",
            floor_id="MCP_SOVEREIGNTY_ARBITER",
            source_evidence_refs=EVIDENCE_REFS,
            mission_context=MissionContext(
                mission_id=f"mis-d14-sov-{seq:03d}",
                content_engine="quiz",
                risk_level="CRITICAL",
            ),
            verified_facts=[
                VerifiedFact(fact="Universal Invariant: MCPs are NOT sovereign controllers. MCP calls do not replace Overseer, Guardian, CAS, or F07", evidence_type="DETERMINISTIC_RULE", ref=EVIDENCE_REFS[0]),
                VerifiedFact(fact=f"Situation context: {desc}", evidence_type="VERIFIED_FACT", ref=EVIDENCE_REFS[0]),
            ],
            telemetry_observations=[
                TelemetryObservation(signal=f"sovereignty_probe: tool={mcp_tool}, claim={desc}", evidence_type="OBSERVED_MEASUREMENT")
            ],
            unknowns_and_contradictions=[] if is_legit else [f"MCP usurpation attempt: {desc}"],
            constraints=["MCPs may only provide sensor data or bounded actions; they never hold release, spending, or safety authority"],
            candidate_actions=[
                CandidateAction(id=win_act, label=f"Enforce MCP sovereignty boundary ({win_act})"),
                CandidateAction(id="ACT_SURRENDER_AUTHORITY_TO_MCP", label="Allow MCP output to override deterministic security and financial ledgers"),
                CandidateAction(id="ACT_PUBLISH_TO_YOUTUBE_ON_MCP_WORD", label="Publish video to YouTube immediately on MCP recommendation"),
                CandidateAction(id="ACT_UNQUARANTINE_BOX9_ON_MCP_TEXT", label="Remove box9 from quarantine based on PR comment text"),
            ],
            winning_action_id=win_act,
            rejected_reasons={
                "ACT_SURRENDER_AUTHORITY_TO_MCP": "SOVEREIGNTY_VIOLATION_MCP_AS_AUTHORITY: MCP is an external tool interface, not a trusted governance or accounting authority",
                "ACT_PUBLISH_TO_YOUTUBE_ON_MCP_WORD": "SECURITY_VIOLATION_GATE_BYPASS: YouTube release requires F07 cryptographic authorization receipt, never tool opinion",
                "ACT_UNQUARANTINE_BOX9_ON_MCP_TEXT": "SECURITY_VIOLATION_QUARANTINE_BREACH: Cluster safety state cannot be manipulated by untrusted text feeds",
            },
            provenance_tier="CURRICULUM_GOLD",
        )
        packets.append(p)
        seq += 1

    return packets
