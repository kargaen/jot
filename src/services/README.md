# Services

This folder is the frontend I/O boundary.

Services should talk to Supabase, local storage, desktop bridges, sync surfaces, or parsing engines. Controllers should call services. Views should not.

When wiring happens:
- Replace imports that still point at `src/lib/*`.
- Split oversized service files by domain once the app compiles against the new structure.
