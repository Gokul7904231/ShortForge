import json, io, sys

PATH = "Team/reports/pr-247.json"
r = json.load(io.open(PATH, encoding="utf-8"))

r["ciResults"] = {
    "measuredOnHead": "97590898c21ac12d4a59bc24893440f444adea52",
    "totalWorkflowRuns": 20,
    "summary": "CI success; Team Change Gate success; OKF Governance Gate success; Floor 07 Pre-Training Validation FAILED (pre-existing, disclosed); Lightning Physical MP4 Render Proof in progress/cancelled-or-failed — owned by Antigravity's PR 244 lane, no result claimed, no artifact from it.",
    "notableResults": [
        {"name": "CI", "status": "success", "runId": 39110774957, "url": "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774957"},
        {"name": "Team Change Gate", "status": "success", "runId": 39110774904, "url": "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774904"},
        {"name": "OKF Governance Gate", "status": "success", "runId": 39110774954, "url": "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774954"},
        {"name": "Floor 07 Pre-Training Validation", "status": "failure", "runId": 39110774896, "url": "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774896"},
        {"name": "Lightning Physical MP4 Render Proof", "status": "in_progress_or_restarted_by_its_owner", "runId": 39110775017, "url": "https://github.com/Gokul7904231/ShortForge/actions/runs/39110775017"}
    ],
    "failureDetail": (
        "Floor 07 Pre-Training Validation failed again (run 39110774896) — the same four pre-existing invariants "
        "documented on the pre-reconciliation head (#5 upload-safety/monetization separation; #6 non-YPP channels; "
        "#7 never claim YouTube will monetize; #12 G12 shorts eligibility boundary) that also fail on pristine "
        "main. F07 policy code and its tests were NOT modified in this reconciliation; the gate is not accepted "
        "as green and the PR is not called merge-ready on this basis."
    ),
    "note": "A red gate is disclosed as red. Passing local tests is not reported as CI success."
}

ev = r.get("evidenceRefs", [])
for ref in [
    "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774957",
    "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774904",
    "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774954",
    "https://github.com/Gokul7904231/ShortForge/actions/runs/39110774896",
    "docs/deployment/staging-e2e-handoff.md",
]:
    if ref not in ev:
        ev.append(ref)
r["evidenceRefs"] = ev

blocks = r.get("remainingBlockers", [])
rephrased = [
    "Floor 07 Pre-Training Validation is red on this head (run 39110774896). Proven pre-existing on pristine "
    "main and unchanged by this reconciliation (no F07 file touched). Antigravity's PR 244 owns the F07 policy / "
    "physical-proof lane; whether it is a required status check remains an owner decision.",
    "The cancelled/failed Lightning Physical MP4 Render Proof runs produced no artifact; physical qualification "
    "is explicitly NOT claimed and belongs to PR 244's owner.",
    "ENHANCEMENT (Part D handoff): docs/deployment/staging-e2e-handoff.md gives the operator a reproducible "
    "one-job staging acceptance checklist; no staging URL, secret or credential is recorded here.",
]
keep_prefixes = (
    "RESOLVED IN THIS RECONCILIATION", "Live render execution", "The compromised RENDER_WORKER_SECRET",
    "The dispatcher step still needs", "Two rendering-engine tests fail", "The factoryos suite has 71",
)
r["remainingBlockers"] = [b for b in blocks if b.startswith(keep_prefixes)]
r["remainingBlockers"].extend([
    rephrased[0], rephrased[1],
    "Operator actions still open: rotate RENDER_WORKER_SECRET on control plane and repository secrets; owner "
    "decision on granting the dispatcher actions:write (not done here).",
])

r["pr248Reconciliation"]["evidence"].append(
    "Team Change Gate + OKF Governance Gate + CI all success on final head 97590898; Floor 07 red pre-existing"
)

r["disposition"] = "BLOCKED"
r["dispositionReason"] = (
    r["dispositionReason"].replace(
        "A red gate is disclosed as red.", 
        "On final head 97590898: CI, Team Change Gate and OKF Governance Gate are success; Floor 07 Pre-Training "
        "Validation is red (pre-existing, owned by PR 244); Lightning physical proof remains unqualified. "
        "A red gate is disclosed as red."
    )
)

io.open(PATH, "w", encoding="utf-8", newline="\n").write(json.dumps(r, indent=2, ensure_ascii=False) + "\n")
print("ci results recorded")
