from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OKF = ROOT / '.okf'

FRONTMATTER_RE = re.compile(r'\A---\n(.*?)\n---\n?', re.DOTALL)
LINK_RE = re.compile(r'\[[^\]]*\]\(([^)]+)\)')

def walk_corpus() -> list[Path]:
    return sorted(p for p in OKF.rglob('*.md') if p.is_file())

def parse_frontmatter(path: Path) -> dict:
    text = path.read_text(encoding='utf-8')
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    result: dict = {}
    for line in m.group(1).splitlines():
        if ':' not in line:
            continue
        key, _, value = line.partition(':')
        result[key.strip()] = value.strip()
    return result

def extract_links(path: Path) -> list[str]:
    text = path.read_text(encoding='utf-8')
    return [l for l in LINK_RE.findall(text) if not l.startswith(('http://', 'https://', 'mailto:', '#'))]

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    files = walk_corpus()
    print(f'CORPUS_FILES={len(files)}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
