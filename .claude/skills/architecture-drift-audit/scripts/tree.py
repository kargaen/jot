#!/usr/bin/env python3
"""Regenerate an annotated folder tree for ARCHITECTURE.md without losing annotations.

Generating a tree is trivial. Not destroying the `# what this is for` comments a human
wrote next to each path is the hard part, and the only reason this script exists.

Usage:
    python tree.py <repo-root> --depth 3
    python tree.py <repo-root> --depth 3 --merge ARCHITECTURE.md

With --merge, reads the existing fenced tree out of the given document, carries each
surviving path's annotation forward, and reports what changed. Nothing is written; the
result goes to stdout for you to review before pasting.

Exit: 0 = tree unchanged, 1 = paths added or removed
"""
import argparse
import re
import sys
from pathlib import Path

EXCLUDE = {
    ".git", ".hg", ".svn", "__pycache__", ".pytest_cache", ".mypy_cache",
    ".ruff_cache", "node_modules", ".venv", "venv", "env", "dist", "build",
    ".next", ".tox", "target", ".idea", ".vscode", ".DS_Store", "htmlcov",
    ".eggs", "site-packages",
}

# "│   ├── name/    # annotation"  ->  (name, annotation)
TREE_LINE = re.compile(r"^[\s│├└─]*([\w.\-]+/?)\s*(?:#\s*(.*))?$")


def walk(root: Path, depth: int, prefix: str = "", level: int = 0):
    if level >= depth:
        return
    try:
        kids = sorted(
            (p for p in root.iterdir()
             if p.name not in EXCLUDE and not p.name.startswith(".")),
            key=lambda p: (p.is_file(), p.name.lower()),
        )
    except PermissionError:
        return
    for i, p in enumerate(kids):
        last = i == len(kids) - 1
        yield prefix + ("└── " if last else "├── ") + p.name + ("/" if p.is_dir() else ""), p.name + ("/" if p.is_dir() else "")
        if p.is_dir():
            yield from walk(p, depth, prefix + ("    " if last else "│   "), level + 1)


def existing_annotations(doc: Path):
    """Pull `name -> annotation` out of the first fenced tree block in doc."""
    text = doc.read_text(encoding="utf-8")
    blocks = re.findall(r"```(?:text)?\n(.*?)```", text, re.S)
    ann = {}
    for b in blocks:
        if "├──" not in b and "└──" not in b:
            continue
        for line in b.splitlines():
            m = TREE_LINE.match(line)
            if m and m.group(2):
                ann[m.group(1)] = m.group(2).strip()
    return ann


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--depth", type=int, default=3)
    ap.add_argument("--merge", type=Path, help="document holding the current tree")
    a = ap.parse_args()

    rows = list(walk(a.root, a.depth))
    old = existing_annotations(a.merge) if a.merge else {}

    width = max((len(r[0]) for r in rows), default=0) + 2
    print("```text")
    print(f"{a.root.name}/")
    seen = set()
    for rendered, key in rows:
        seen.add(key)
        note = old.get(key)
        print(f"{rendered:<{width}}# {note}" if note else rendered)
    print("```")

    if not a.merge:
        return 0

    added = [k for k in seen if k not in old]
    removed = [k for k in old if k not in seen]

    if added:
        print("\n# ADDED — each needs an annotation written by a human:", file=sys.stderr)
        for k in sorted(added):
            print(f"#   {k}", file=sys.stderr)
    if removed:
        print("\n# REMOVED — annotation lost; confirm the path is really gone:", file=sys.stderr)
        for k in sorted(removed):
            print(f"#   {k}  (was: {old[k]})", file=sys.stderr)
    if not added and not removed:
        print("\n# Tree unchanged. Annotations carried forward.", file=sys.stderr)
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
