from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[2]
OKF = ROOT / '.okf'
MANIFEST = OKF / 'manifest.yaml'
RULE_INDEX = OKF / 'rules' / 'index.json'

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--rules', default=str(RULE_INDEX))
    args = parser.parse_args()
    errors: list[str] = []
    if not MANIFEST.exists(): errors.append('missing .okf/manifest.yaml')
    if not Path(args.rules).exists(): errors.append('missing .okf/rules/index.json')
    if not errors:
        manifest = yaml.safe_load(MANIFEST.read_text(encoding='utf-8'))
        if manifest.get('okf_version') != 2: errors.append('manifest okf_version must be 2')
        data = json.loads(Path(args.rules).read_text(encoding='utf-8'))
        rules = data.get('rules', [])
        if not isinstance(rules, list) or not rules: errors.append('rule index must contain a non-empty rules array')
        ids: set[str] = set()
        for rule in rules:
            rid = rule.get('ruleId')
            if rid in ids: errors.append(f'duplicate ruleId: {rid}')
            ids.add(rid)
            for ref in rule.get('sourceRefs', []):
                if not (ROOT / ref).exists(): errors.append(f'{rid}: missing sourceRef {ref}')
    if errors:
        for e in errors: print(f'ERROR: {e}', file=sys.stderr)
        return 1
    print('OKF_LINT=PASS')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
