# Controllers

This folder is the intended orchestration layer.

When wiring happens:
- Views should call hooks or controllers, not services directly.
- Controllers should own cross-model workflows, optimistic updates, and side-effect ordering.
- Rename or consolidate controllers where feature boundaries become clearer.
