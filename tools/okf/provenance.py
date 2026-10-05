from __future__ import annotations
import argparse, hashlib, json, os, subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]

def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git_sha() -> str:
    return subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,text=True,capture_output=True,check=True).stdout.strip()

def build_provenance(sweep_path: str, drift_path: str|None = None) -> dict:
    sweep=json.loads(Path(sweep_path).read_text(encoding='utf-8'))
    drift=json.loads(Path(drift_path).read_text(encoding='utf-8')) if drift_path else None
    return {
      'schemaVersion':'1.0',
      'provenanceType':'SHORTFORGE_OKF_RELEASE',
      'repository':os.getenv('GITHUB_REPOSITORY','UNKNOWN'),
      'commitSha':git_sha(),
      'generatedAt':datetime.now(timezone.utc).isoformat(),
      'governance':{
        'corpusSha256':sweep['corpusSha256'],
        'sweepEnvelopeSha256':sweep['envelopeSha256'],
        'relevantRuleIds':sorted(sweep.get('relevantRules',[])),
        'sweepStatus':sweep.get('okfSweep'),
        'driftStatus':None if drift is None else drift.get('status'),
        'criticalHighRules':None if drift is None else drift.get('criticalHighRules'),
        'coveredCriticalHigh':None if drift is None else drift.get('coveredCriticalHigh')
      },
      'verification':{
        'okfSweepArtifactSha256':sha256_file(Path(sweep_path)),
        'driftArtifactSha256':sha256_file(Path(drift_path)) if drift_path else None
      },
      'authority':'EVIDENCE_ONLY',
      'productionReleaseEligible':False
    }

def main()->int:
    p=argparse.ArgumentParser(); p.add_argument('--sweep',required=True); p.add_argument('--drift'); p.add_argument('--out',required=True); a=p.parse_args()
    data=build_provenance(a.sweep,a.drift); Path(a.out).write_text(json.dumps(data,indent=2,sort_keys=True)+'\n',encoding='utf-8')
    print(json.dumps(data,indent=2,sort_keys=True)); return 0

if __name__=='__main__': raise SystemExit(main())
