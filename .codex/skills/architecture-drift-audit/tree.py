#!/usr/bin/env python3
"""Regenerate an annotated folder tree for ARCHITECTURE.md without losing annotations.

Generating a tree is trivial. Not destroying the `# what this is for` comments a human
wrote next to each path is the hard part, and the only reason this script exists.

Usage:
    python tree.py <repo-root> --depth 3
    python tree.py <repo-root> --depth 3 --merge ARCHITECTURE.md
    python tree.py <repo-root> --depth 3 --include-hidden

With --merge, reads the FIRST fenced tree out of the given document, carries each
surviving path's annotation forward (keyed by full relative path, so same-named
directories at different depths never share an annotation), and reports what changed.
Nothing is written; the result goes to stdout for you to review before pasting.

Exit: 0 = tree unchanged, or no --merge given (nothing compared); 1 = paths added
or removed; 2 = bad usage.
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

# "│   ├── name/    # annotation" -> (indent, name, annotation). Names may contain
# spaces; the annotation starts at the first "#".
TREE_LINE = re.compile(r"^([\s│├└─]*)([^#\n]+?)\s*(?:#\s*(.*))?$")
BRANCH_RE = re.compile(r"[├└]── ")


def walk(root: Path, depth: int, include_hidden: bool,
         prefix: str = "", rel: str = "", level: int = 0):
    if level >= depth:
        return
    try:
        kids = sorted(
            (p for p in root.iterdir()
             if p.name not in EXCLUDE
             and (include_hidden or not p.name.startswith("."))),
            key=lambda p: (p.is_file(), p.name.lower()),
        )
    except PermissionError:
        return
    for i, p in enumerate(kids):
        last = i == len(kids) - 1
        name = p.name + ("/" if p.is_dir() else "")
        key = rel + name
        yield prefix + ("└── " if last else "├── ") + name, key
        if p.is_dir():
            yield from walk(p, depth, include_hidden,
                            prefix + ("    " if last else "│   "), key, level + 1)


def existing_annotations(doc: Path):
    """Pull `relative/path -> annotation` out of the FIRST fenced tree block in doc.

    Depth is recovered from the indent width (4 chars per level), and a stack of
    directory names rebuilds each entry's full relative path — so annotations are
    keyed unambiguously even when basenames repeat.
    """
    text = doc.read_text(encoding="utf-8")
    for block in re.findall(r"```(?:text)?\n(.*?)```", text, re.S):
        if "├──" not in block and "└──" not in block:
            continue
        ann, stack = {}, []
        for line in block.splitlines():
            if not BRANCH_RE.search(line):
                continue  # root line or blank
            m = TREE_LINE.match(line)
            if not m:
                continue
            indent, name, note = m.groups()
            level = len(BRANCH_RE.split(line)[0]) // 4
            stack = stack[:level]
            key = "".join(stack) + name
            if name.endswith("/"):
                stack.append(name)
            if note:
                ann[key] = note.strip()
        return ann  # first tree block only
    return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root", type=Path)
    ap.add_argument("--depth", type=int, default=3)
    ap.add_argument("--merge", type=Path, help="document holding the current tree")
    ap.add_argument("--include-hidden", action="store_true",
                    help="include dot-directories like .github (EXCLUDE still applies)")
    a = ap.parse_args()

    rows = list(walk(a.root, a.depth, a.include_hidden))
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
