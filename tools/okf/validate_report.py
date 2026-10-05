from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('report')
    args = parser.parse_args()
    data = json.loads(Path(args.report).read_text(encoding='utf-8'))
    errors: list[str] = []
    okf = data.get('okf', {})
    if okf.get('sweepStatus') not in {'COMPLETE','INCIDENT_FOLLOWUP'}: errors.append('OKF sweep is not complete')
    for conflict in data.get('conflicts', []):
        if conflict.get('status') == 'OPEN': errors.append(f"open conflict: {conflict.get('id')}")
    security = data.get('security', {})
    if security.get('status') in {'BLOCKED','UNPROVEN'} and data.get('disposition') == 'PASS': errors.append('UNPROVEN/BLOCKED security evidence cannot produce PASS')
    if data.get('disposition') == 'PASS' and not data.get('evidenceRefs'): errors.append('PASS requires evidenceRefs')
    if not data.get('changeId'): errors.append('missing changeId')
    if errors:
        for e in errors: print(f'ERROR: {e}', file=sys.stderr)
        return 1
    print('OKF_TEAM_REPORT_VALID=PASS')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
