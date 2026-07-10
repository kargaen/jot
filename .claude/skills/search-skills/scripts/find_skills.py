#!/usr/bin/env python3
"""List, describe, or search installed skills by reading frontmatter only.

Never loads a SKILL.md body. Frontmatter is ~2 lines; bodies are ~120.

Usage:
    find_skills.py                  list every skill name
    find_skills.py <skill-name>     what that skill is for
    find_skills.py <search string>  skills most likely to match
"""
import re
import sys
from pathlib import Path

ROOTS = [
    Path.cwd() / ".claude" / "skills",
    Path.home() / ".claude" / "skills",
    Path(__file__).resolve().parents[2],
]

STOP = {"the", "a", "an", "is", "are", "to", "for", "of", "in", "on", "and", "or",
        "when", "use", "this", "skill", "that", "it", "be", "with", "my", "i"}


def load():
    """name -> (description, path). First root wins."""
    out = {}
    for root in ROOTS:
        if not root.is_dir():
            continue
        for p in sorted(root.glob("*/SKILL.md")):
            m = re.match(r"^---\n(.*?)\n---", p.read_text(encoding="utf-8"), re.S)
            if not m:
                continue
            fm = m.group(1)
            name = re.search(r"^name:\s*(.+)$", fm, re.M)
            desc = re.search(r"^description:\s*(.+?)(?=\n\w+:|\Z)", fm, re.M | re.S)
            if name and name.group(1).strip() not in out:
                out[name.group(1).strip()] = (
                    " ".join(desc.group(1).split()) if desc else "", p)
    return out


def purpose(desc):
    """The trigger clause. Descriptions open with 'Use this skill when/whenever ...'."""
    first = re.split(r"(?<=[.!?])\s+", desc)[0] if desc else ""
    return first or desc[:200]


def stem(w):
    """Crude suffix stripping so 'dependencies' matches 'dependency'."""
    for a, b in (("ies", "y"), ("ing", ""), ("ies", "y"), ("es", ""), ("s", "")):
        if w.endswith(a) and len(w) - len(a) >= 3:
            return w[: -len(a)] + b
    return w


def tokens(s):
    return {stem(w) for w in re.findall(r"[a-z]+", s.lower())
            if w not in STOP and len(w) > 2}


def main():
    skills = load()
    if not skills:
        print("No skills found. Looked in:", *[f"  {r}" for r in ROOTS], sep="\n")
        return 1

    arg = " ".join(sys.argv[1:]).strip()

    # Mode 1 — list
    if not arg:
        for n in skills:
            print(n)
        return 0

    # Mode 2 — exact or unambiguous prefix match on a name
    exact = [n for n in skills if n == arg]
    prefix = [n for n in skills if n.startswith(arg)] if not exact else []
    hit = exact or (prefix if len(prefix) == 1 else [])
    if hit:
        n = hit[0]
        print(f"{n}\n\n  {purpose(skills[n][0])}")
        return 0

    # Mode 3 — search
    q = tokens(arg)
    if not q:
        print("Nothing searchable in that string.")
        return 1
    scored = []
    for n, (d, _) in skills.items():
        if n == "search-skills":
            continue  # its description quotes example queries; it poisons its own index
        nt, dt = tokens(n.replace("-", " ")), tokens(d)
        score = 3 * len(q & nt) + len(q & dt)
        if score:
            scored.append((score, n))
    if not scored:
        print(f"No skill matches {arg!r}. Run with no argument to list all.")
        return 1

    scored.sort(key=lambda x: (-x[0], x[1]))
    top = scored[0][0]
    # 3 = one name-token hit. Below that, description overlap alone is noise:
    # "fix" and "keep" appear in half the descriptions and mean nothing.
    if top < 3:
        print(f"No skill clearly matches {arg!r}.\n"
              "Lexical search only — try a keyword from the skill's name, "
              "or run with no argument to list all.")
        return 1
    for score, n in scored[:3]:
        if score < top:
            break
        print(f"{n}\n  {purpose(skills[n][0])}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
