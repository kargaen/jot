# Views

This folder is the frontend presentation layer.

The goal is for a new visitor to see the UI hierarchy immediately: reusable components first, page-level surfaces second.

When wiring happens:
- Views should import models, view helpers, or hooks, but not raw services.
- Keep event handlers thin and push orchestration upward into hooks/controllers.
