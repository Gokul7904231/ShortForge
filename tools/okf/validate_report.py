from __future__ import annotations
import argparse, json, sys
from pathlib import Path

def main() -> int:
    p=argparse.ArgumentParser()
    p.add_argument('report')
    p.add_argument('--sweep', required=True)
    args=p.parse_args()
    report=json.loads(Path(args.report).read_text(encoding='utf-8'))
    sweep=json.loads(Path(args.sweep).read_text(encoding='utf-8'))
    errors=[]
    okf=report.get('okf',{})
    if okf.get('sweepStatus') not in {'COMPLETE','INCIDENT_FOLLOWUP'}: errors.append('OKF sweep is not complete')
    machine=okf.get('machineSweep')
    if not isinstance(machine,dict): errors.append('missing okf.machineSweep linkage')
    else:
        if machine.get('artifact') != Path(args.sweep).name: errors.append('Team report machine sweep artifact mismatch')
        if machine.get('bindingMode') != 'CI_COMPILED_ARTIFACT': errors.append('Team report machine sweep bindingMode is invalid')
        if machine.get('corpusSha256') and machine.get('corpusSha256') != sweep.get('corpusSha256'): errors.append('Team report corpusSha256 does not match compiled sweep')
        if sorted(machine.get('relevantRules',[])) != sorted(sweep.get('relevantRules',[])): errors.append('Team report relevantRules does not match compiled sweep')
        if machine.get('sweepStatus') != sweep.get('okfSweep'): errors.append('Team report machine sweep status mismatch')
    for conflict in report.get('conflicts',[]):
        if conflict.get('status')=='OPEN': errors.append(f"open conflict: {conflict.get('id')}")
    security=report.get('security',{})
    if security.get('status') in {'BLOCKED','UNPROVEN'} and report.get('disposition')=='PASS': errors.append('UNPROVEN/BLOCKED security evidence cannot produce PASS')
    if report.get('disposition')=='PASS' and not report.get('evidenceRefs'): errors.append('PASS requires evidenceRefs')
    if not report.get('changeId'): errors.append('missing changeId')
    if errors:
        for e in errors: print(f'ERROR: {e}',file=sys.stderr)
        return 1
    print('OKF_TEAM_REPORT_VALID=PASS')
    return 0

if __name__=='__main__': raise SystemExit(main())
