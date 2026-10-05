from __future__ import annotations
import argparse, json, subprocess
from datetime import datetime, timezone
from pathlib import Path

from .sweep import ROOT, RULE_INDEX, validate_rules

DIGESTS = ROOT / '.okf' / 'rules' / 'source-digests.json'
SEVERITIES = {'CRITICAL','HIGH'}
ACTIVE = {'ACTIVE'}

def git_blob_sha(path: Path) -> str:
    result = subprocess.run(['git','hash-object',path.as_posix()], cwd=ROOT, text=True, capture_output=True, check=True)
    return result.stdout.strip()

def load_rules() -> list[dict]:
    return json.loads(RULE_INDEX.read_text(encoding='utf-8')).get('rules', [])

def check_rule_coverage(rules: list[dict]) -> list[str]:
    errors=[]
    for rule in rules:
        if rule.get('status') in ACTIVE and rule.get('severity') in SEVERITIES:
            refs=rule.get('verificationRefs',[])
            if not isinstance(refs,list) or not refs:
                errors.append(f"{rule.get('ruleId')}: missing verificationRefs")
            for ref in refs or []:
                path=str(ref).split('::',1)[0]
                if not (ROOT/path).exists():
                    errors.append(f"{rule.get('ruleId')}: missing verificationRef {ref}")
    return errors

def check_source_digest_pair(path: Path, expected: str) -> str | None:
    if not expected:
        return f'unpinned active-rule sourceRef digest: {path.relative_to(ROOT).as_posix()}'
    try:
        actual=git_blob_sha(path)
    except Exception as exc:
        return f'cannot hash {path.relative_to(ROOT).as_posix()}: {exc}'
    if actual != expected:
        return f'source drift: {path.relative_to(ROOT).as_posix()} expected {expected} actual {actual}'
    return None

def check_source_drift(rules: list[dict]) -> list[str]:
    errors=[]
    if not DIGESTS.exists(): return ['missing source-digests.json']
    snap=json.loads(DIGESTS.read_text(encoding='utf-8')).get('files',{})
    needed=set()
    for rule in rules:
        if rule.get('status') in ACTIVE: needed.update(str(x) for x in rule.get('sourceRefs',[]))
    for ref in sorted(needed):
        path=ROOT/ref
        if not path.exists(): errors.append(f'missing active-rule sourceRef: {ref}'); continue
        error=check_source_digest_pair(path, snap.get(ref))
        if error: errors.append(error)
    for rule in rules:
        if rule.get('status') in ACTIVE:
            for item in rule.get('enforcement', []):
                ref=str(item.get('ref',''))
                if item.get('type') == 'CI' and (ref.startswith('.') or '/' in ref or ref.endswith(('.py','.mjs','.ts','.yml','.yaml'))):
                    if not (ROOT/ref).exists(): errors.append(f"{rule.get('ruleId')}: enforcement ref missing {ref}")
    return errors

def parse_dt(value: str, field: str, rid: str, errors: list[str]):
    try:
        dt=datetime.fromisoformat(value.replace('Z','+00:00'))
        if dt.tzinfo is None: errors.append(f'{rid}: {field} must include timezone'); return None
        return dt
    except Exception:
        errors.append(f'{rid}: invalid {field}'); return None

def validate_exception_data(data: dict, source: str, now: datetime | None = None) -> list[str]:
    now=now or datetime.now(timezone.utc)
    errors=[]; rid=str(data.get('exceptionId') or source)
    status=data.get('status')
    if not rid.startswith('EXC-'): errors.append(f'{rid}: invalid exceptionId')
    if not isinstance(data.get('ruleRefs'),list) or not data.get('ruleRefs'): errors.append(f'{rid}: ruleRefs required')
    if not isinstance(data.get('scope',{}).get('paths'),list) or not data.get('scope',{}).get('paths'): errors.append(f'{rid}: scope.paths required')
    if not isinstance(data.get('compensatingControls'),list) or not data.get('compensatingControls'): errors.append(f'{rid}: compensatingControls required')
    starts=parse_dt(str(data.get('startsAt','')), 'startsAt', rid, errors)
    expires=parse_dt(str(data.get('expiresAt','')), 'expiresAt', rid, errors)
    if starts and expires and starts>=expires: errors.append(f'{rid}: startsAt must be before expiresAt')
    if status=='OPEN': errors.append(f'{rid}: OPEN exception is not an authorization')
    if status=='APPROVED' and expires and expires<=now: errors.append(f'{rid}: approved exception expired')
    if status not in {'OPEN','APPROVED','EXPIRED','CLOSED','REJECTED'}: errors.append(f'{rid}: invalid status')
    return errors

def check_exceptions() -> list[str]:
    errors=[]; directory=ROOT/'.okf'/'exceptions'
    if not directory.exists(): return errors
    for path in sorted(directory.glob('*.json')):
        try: data=json.loads(path.read_text(encoding='utf-8'))
        except Exception as exc: errors.append(f'{path}: invalid JSON: {exc}'); continue
        errors.extend(f'{path}: {e}' for e in validate_exception_data(data, path.stem))
    return errors

def main() -> int:
    p=argparse.ArgumentParser(); p.add_argument('--json-out',default=''); args=p.parse_args()
    rules=load_rules(); errors=validate_rules(rules)+check_rule_coverage(rules)+check_source_drift(rules)+check_exceptions()
    result={'schemaVersion':'1.0','status':'PASS' if not errors else 'BLOCKED','errors':errors,'activeRules':sum(r.get('status')=='ACTIVE' for r in rules),'criticalHighRules':sum(r.get('status')=='ACTIVE' and r.get('severity') in SEVERITIES for r in rules),'coveredCriticalHigh':sum(1 for r in rules if r.get('status')=='ACTIVE' and r.get('severity') in SEVERITIES and r.get('verificationRefs'))}
    rendered=json.dumps(result,indent=2,sort_keys=True)+'\n'
    if args.json_out: Path(args.json_out).write_text(rendered,encoding='utf-8')
    print(rendered,end='')
    return 0 if not errors else 1

if __name__=='__main__': raise SystemExit(main())
