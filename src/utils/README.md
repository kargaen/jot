# Utils

This folder is for cross-cutting helpers that do not fit cleanly as models or services.

When wiring happens:
- Be careful not to let `utils` become the new dumping ground.
- If a helper starts owning I/O or domain rules, move it into `services` or `models`.
