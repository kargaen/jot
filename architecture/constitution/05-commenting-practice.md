# 5. Commenting Practice

Prefer self-explanatory code over explanatory comments. Add comments only where they provide context the code itself cannot express quickly, such as architectural intent, non-obvious constraints, workflow invariants, edge-case reasoning, or why a particular approach was chosen. Do not add comments that merely restate what the next line of code already says. A small number of high-value comments is preferred over pervasive low-signal commentary.

- Comment `why`, not `what`.
- Comment invariants, assumptions, and surprising behavior.
- Comment cross-layer or cross-domain decisions that would be hard to infer locally.
- Avoid line-by-line narration of obvious code.
- If a function needs many explanatory comments, prefer refactoring it into clearer names and smaller units first.

Comments should reduce future confusion, not decorate code.
