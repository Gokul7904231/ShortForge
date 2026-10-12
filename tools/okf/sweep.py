from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[2]
OKF = ROOT / '.okf'
MANIFEST = OKF / 'manifest.yaml'
RULE_INDEX = OKF / 'rules' / 'index.json'

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def inventory() -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    for path in sorted(OKF.rglob('*')):
        if path.is_file():
            rel = path.relative_to(ROOT).as_posix()
            rows.append((rel, sha256_bytes(path.read_bytes())))
    return rows

def corpus_hash(rows: list[tuple[str, str]]) -> str:
    payload = '\n'.join(f'{path} {digest}' for path, digest in rows).encode()
    return sha256_bytes(payload)

def changed_paths(base: str | None, head: str | None) -> list[str]:
    if not base or not head:
        return []
    try:
        result = subprocess.run([
            'git', 'diff', '--name-only', f'{base}...{head}'
        ], cwd=ROOT, capture_output=True, text=True, check=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        raise RuntimeError(f'cannot determine changed paths for {base}...{head}: {exc}') from exc
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]

def applies(path: str, patterns: list[str]) -> bool:
    path = path.lstrip('./')
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)

def load_rules() -> list[dict[str, Any]]:
    data = json.loads(RULE_INDEX.read_text(encoding='utf-8'))
    rules = data.get('rules')
    if not isinstance(rules, list):
        raise ValueError('rule index must contain a rules array')
    return rules

def validate_rules(rules: list[dict[str, Any]]) -> list[str]:
    errors: list[str] = []
    seen: set[str] = set()
    statuses = {'DRAFT','ACTIVE','EXPERIMENTAL','DEPRECATED','SUPERSEDED'}
    severities = {'INFO','LOW','MEDIUM','HIGH','CRITICAL'}
    enforcement_types = {'CI','RUNTIME','GITHUB','TRACE','EVIDENCE','HUMAN_APPROVAL'}
    for rule in rules:
        rid = rule.get('ruleId')
        if not isinstance(rid, str) or not rid.startswith('OKF.'):
            errors.append(f'invalid ruleId: {rid!r}')
            continue
        if rid in seen:
            errors.append(f'duplicate ruleId: {rid}')
        seen.add(rid)
        if rule.get('status') not in statuses:
            errors.append(f'{rid}: invalid status')
        if rule.get('severity') not in severities:
            errors.append(f'{rid}: invalid severity')
        if not isinstance(rule.get('owner'), str) or not rule['owner'].strip():
            errors.append(f'{rid}: missing owner')
        paths = rule.get('appliesTo', {}).get('paths')
        if not isinstance(paths, list) or not paths:
            errors.append(f'{rid}: missing appliesTo.paths')
        enforcement = rule.get('enforcement')
        if not isinstance(enforcement, list) or not enforcement:
            errors.append(f'{rid}: missing enforcement')
        else:
            for item in enforcement:
                if item.get('type') not in enforcement_types or not item.get('ref'):
                    errors.append(f'{rid}: invalid enforcement entry')
        source_refs = rule.get('sourceRefs')
        if not isinstance(source_refs, list) or not source_refs:
            errors.append(f'{rid}: missing sourceRefs')
        else:
            for ref in source_refs:
                if not (ROOT / str(ref)).exists():
                    errors.append(f'{rid}: missing sourceRef {ref}')
    return errors

def build_attestation(base: str | None, head: str | None, compiled_by: str) -> dict[str, Any]:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding='utf-8'))
    if manifest.get('okf_version') != 2:
        raise ValueError('unsupported okf_version')
    rules = load_rules()
    errors = validate_rules(rules)
    if errors:
        raise ValueError('; '.join(errors))
    rows = inventory()
    changed = changed_paths(base, head)
    if any(p == '.okf' or p.startswith('.okf/') for p in changed):
        relevant = sorted(r['ruleId'] for r in rules if r.get('status') == 'ACTIVE')
    elif changed:
        relevant = sorted(r['ruleId'] for r in rules if any(applies(p, r.get('appliesTo', {}).get('paths', [])) for p in changed))
    else:
        relevant = sorted(r['ruleId'] for r in rules if r.get('status') == 'ACTIVE')
    selected = {r['ruleId']: r for r in rules}
    implementation_refs = sorted({
        item['ref'] for rid in relevant for item in selected[rid].get('enforcement', [])
        if item.get('type') in {'RUNTIME', 'CI'}
    })
    test_refs = sorted({
        item['ref'] for rid in relevant for item in selected[rid].get('enforcement', [])
        if item.get('type') == 'CI'
    })
    mappings = sorted({
        ref for rid in relevant for ref in selected[rid].get('sourceRefs', [])
        if '/research/' in str(ref)
    })
    envelope = {
        'schemaVersion': '1.0',
        'okfSweep': 'COMPLETE',
        'corpusSha256': corpus_hash(rows),
        'changedPaths': changed,
        'relevantRules': relevant,
        'relevantMappings': mappings,
        'implementationRefs': implementation_refs,
        'testRefs': test_refs,
        'contradictions': [],
        'exceptionId': None,
        'compiledAt': datetime.now(timezone.utc).isoformat(),
        'compiledBy': compiled_by,
    }
    canonical = json.dumps(envelope, sort_keys=True, separators=(',', ':')).encode()
    envelope['envelopeSha256'] = sha256_bytes(canonical)
    return envelope

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default=os.getenv('OKF_BASE_REF'))
    parser.add_argument('--head', default=os.getenv('OKF_HEAD_REF', 'HEAD'))
    parser.add_argument('--compiled-by', default=os.getenv('GITHUB_ACTOR', 'local'))
    parser.add_argument('--output', default='')
    args = parser.parse_args()
    data = build_attestation(args.base, args.head, args.compiled_by)
    rendered = json.dumps(data, indent=2, sort_keys=True) + '\n'
    if args.output:
        Path(args.output).write_text(rendered, encoding='utf-8')
    else:
        print(rendered)
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
