from __future__ import annotations
import argparse, json, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

from .sweep import ROOT, RULE_INDEX, validate_rules

DIGESTS = ROOT / '.okf' / 'rules' / 'source-digests.json'
SEVERITIES = {'CRITICAL','HIGH'}
ACTIVE = {'ACTIVE'}

def git_blob_sha(path: Path) -> str:
    result = subprocess.run(['git','hash-object',path.as_posix()],cwd=ROOT,text=True,capture_output=True,check=True)
    return result.stdout.strip()

def load_rules():
    data=json.loads(RULE_INDEX.read_text(encoding='utf-8'))
    return data.get('rules',[])

def check_rule_coverage(rules):
    errors=[]
    for r in rules:
        if r.get('status') in ACTIVE and r.get('severity') in SEVERITIES:
            refs=r.get('verificationRefs',[])
            if not isinstance(refs,list) or not refs:
                errors.append(f"{r.get('ruleId')}: missing verificationRefs")
            for ref in refs or []:
                path=ref.split('::',1)[0]
                if not (ROOT/path).exists():
                    errors.append(f"{r.get('ruleId')}: missing verificationRef {ref}")
    return errors

def check_source_drift(rules):
    errors=[]
    if not DIGESTS.exists(): return ['missing source-digests.json']
    snap=json.loads(DIGESTS.read_text(encoding='utf-8')).get('files',{})
    needed=set()
    for r in rules:
        if r.get('status') in ACTIVE:
            needed.update(str(x) for x in r.get('sourceRefs',[]))
    for ref in sorted(needed):
        path=ROOT/ref
        if not path.exists():
            errors.append(f'missing active-rule sourceRef: {ref}')
            continue
        expected=snap.get(ref)
        if not expected:
            errors.append(f'unpinned active-rule sourceRef digest: {ref}')
            continue
        try: actual=git_blob_sha(path)
        except Exception as exc:
            errors.append(f'cannot hash {ref}: {exc}')
            continue
        if actual != expected:
            errors.append(f'source drift: {ref} expected {expected} actual {actual}')
    return errors

def parse_dt(value, field, rid, errors):
    try:
        dt=datetime.fromisoformat(value.replace('Z','+00:00'))
        if dt.tzinfo is None: errors.append(f'{rid}: {field} must include timezone')
        return dt
    except Exception:
        errors.append(f'{rid}: invalid {field}')
        return None

def check_exceptions():
    errors=[]; now=datetime.now(timezone.utc)
    directory=ROOT/'.okf'/'exceptions'
    if not directory.exists(): return errors
    for path in sorted(directory.glob('*.json')):
        try: data=json.loads(path.read_text(encoding='utf-8'))
        except Exception as exc: errors.append(f'{path}: invalid JSON: {exc}'); continue
        rid=data.get('exceptionId',path.stem); status=data.get('status')
        starts=parse_dt(data.get('startsAt',''), 'startsAt', rid, errors)
        expires=parse_dt(data.get('expiresAt',''), 'expiresAt', rid, errors)
        if starts and expires and starts>=expires: errors.append(f'{rid}: startsAt must be before expiresAt')
        if status=='OPEN': errors.append(f'{rid}: OPEN exception is not an authorization')
        if status=='APPROVED' and expires and expires<=now: errors.append(f'{rid}: approved exception expired')
        if status=='APPROVED' and not data.get('compensatingControls'): errors.append(f'{rid}: approved exception missing compensatingControls')
    return errors

def main():
    p=argparse.ArgumentParser(); p.add_argument('--json-out',default=''); args=p.parse_args()
    rules=load_rules(); errors=validate_rules(rules)+check_rule_coverage(rules)+check_source_drift(rules)+check_exceptions()
    result={'schemaVersion':'1.0','status':'PASS' if not errors else 'BLOCKED','errors':errors,'activeRules':len([r for r in rules if r.get('status')=='ACTIVE']),'coveredCriticalHigh':len([r for r in rules if r.get('status')=='ACTIVE' and r.get('severity') in SEVERITIES and r.get('verificationRefs')])}
    rendered=json.dumps(result,indent=2,sort_keys=True)+'\n'
    if args.json_out: Path(args.json_out).write_text(rendered,encoding='utf-8')
    print(rendered,end='')
    return 0 if not errors else 1

if __name__=='__main__': raise SystemExit(main())
