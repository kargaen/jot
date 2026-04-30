# Models

This folder is the frontend model layer.

It should eventually hold the app's data contracts, domain transforms, and pure domain logic.

When wiring happens:
- Move imports away from the legacy `src/types` path and into model-specific modules.
- Prefer domain folders such as `tasks`, `projects`, `spaces`, and `shared`.
