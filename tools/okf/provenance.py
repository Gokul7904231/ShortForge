from __future__ import annotations
import argparse, hashlib, json, os, subprocess, re
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SHA256_RE=re.compile(r"^[a-f0-9]{64}$")

def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def sha256_canonical_json(value: object) -> str:
    payload=json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()

def git_sha() -> str:
    return subprocess.run(["git","rev-parse","HEAD"],cwd=ROOT,text=True,capture_output=True,check=True).stdout.strip()

def _require_string(obj: dict, key: str) -> str:
    value=obj.get(key)
    if not isinstance(value,str) or not value:
        raise ValueError(f"release authorization missing required string field: {key}")
    return value

def _require_sha256(obj: dict, key: str) -> str:
    value=_require_string(obj,key)
    if not SHA256_RE.fullmatch(value):
        raise ValueError(f"release authorization field {key} must be a lowercase SHA-256 hex digest")
    return value

def build_release_authorization_binding(auth_path: str) -> dict:
    auth=json.loads(Path(auth_path).read_text(encoding="utf-8"))

    issuer=_require_string(auth,"issuer")
    if issuer != "F07_RELEASE_GUARDIAN":
        raise ValueError(f"release authorization issuer must be F07_RELEASE_GUARDIAN, got {issuer!r}")

    target_platform=_require_string(auth,"targetPlatform")
    if target_platform != "youtube":
        raise ValueError(f"release authorization targetPlatform must be youtube, got {target_platform!r}")

    status=_require_string(auth,"status")
    if status not in {"ACTIVE","CONSUMED"}:
        raise ValueError(f"release authorization status must be ACTIVE or CONSUMED, got {status!r}")

    signature=_require_string(auth,"signature")
    if not re.fullmatch(r"[a-f0-9]+",signature):
        raise ValueError("release authorization signature must be lowercase hexadecimal")

    binding={
      "source":"F07_RELEASE_AUTHORIZATION",
      "authorizationId":_require_string(auth,"authorizationId"),
      "authorizationVersion":auth.get("authorizationVersion"),
      "authorizationStatus":status,
      "receiptId":_require_string(auth,"receiptId"),
      "receiptDigestSha256":_require_sha256(auth,"receiptDigestSha256"),
      "artifactId":_require_string(auth,"artifactId"),
      "artifactSha256":_require_sha256(auth,"artifactSha256"),
      "artifactCasRef":_require_string(auth,"artifactCasRef"),
      "targetPlatform":target_platform,
      "publicationIntentId":_require_string(auth,"publicationIntentId"),
      "publicationIntentHash":_require_sha256(auth,"publicationIntentHash"),
      "canonicalPayloadHash":_require_sha256(auth,"canonicalPayloadHash"),
      "policySnapshotIds":auth.get("policySnapshotIds") or [],
      "evidenceVersion":_require_string(auth,"evidenceVersion"),
      "signerKeyId":_require_string(auth,"signerKeyId"),
      "authorizationSignatureSha256":hashlib.sha256(signature.encode("ascii")).hexdigest(),
      "authorizationBodySha256":sha256_canonical_json({
          k:v for k,v in auth.items()
          if k not in {"signature","signerKeyId","uploadSessionUri","invalidatedAt","invalidatedBy","invalidationReason","consumedAt"}
      }),
    }

    if not isinstance(binding["authorizationVersion"],int):
        raise ValueError("release authorization authorizationVersion must be an integer")
    if not isinstance(binding["policySnapshotIds"],list) or not all(isinstance(x,str) and x for x in binding["policySnapshotIds"]):
        raise ValueError("release authorization policySnapshotIds must be a list of non-empty strings")

    return binding

def build_provenance(sweep_path: str, drift_path: str|None = None, release_authorization_path: str|None = None) -> dict:
    sweep=json.loads(Path(sweep_path).read_text(encoding="utf-8"))
    drift=json.loads(Path(drift_path).read_text(encoding="utf-8")) if drift_path else None
    data={
      "schemaVersion":"1.0",
      "provenanceType":"SHORTFORGE_OKF_RELEASE",
      "repository":os.getenv("GITHUB_REPOSITORY","UNKNOWN"),
      "commitSha":git_sha(),
      "generatedAt":datetime.now(timezone.utc).isoformat(),
      "governance":{
        "corpusSha256":sweep["corpusSha256"],
        "sweepEnvelopeSha256":sweep["envelopeSha256"],
        "relevantRuleIds":sorted(sweep.get("relevantRules",[])),
        "sweepStatus":sweep.get("okfSweep"),
        "driftStatus":None if drift is None else drift.get("status"),
        "criticalHighRules":None if drift is None else drift.get("criticalHighRules"),
        "coveredCriticalHigh":None if drift is None else drift.get("coveredCriticalHigh")
      },
      "verification":{
        "okfSweepArtifactSha256":sha256_file(Path(sweep_path)),
        "driftArtifactSha256":sha256_file(Path(drift_path)) if drift_path else None
      },
      "authority":"EVIDENCE_ONLY",
      "productionReleaseEligible":False
    }
    if release_authorization_path:
        data["releaseAuthorizationBinding"]=build_release_authorization_binding(release_authorization_path)
    return data

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument("--sweep",required=True)
    p.add_argument("--drift")
    p.add_argument("--release-authorization")
    p.add_argument("--out",required=True)
    a=p.parse_args()
    data=build_provenance(a.sweep,a.drift,a.release_authorization)
    Path(a.out).write_text(json.dumps(data,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps(data,indent=2,sort_keys=True))
    return 0

if __name__=="__main__":
    raise SystemExit(main())
