# Hooks

React-facing hooks belong here.

Current note:
- `useAuth.tsx` was moved here because it behaves like a hook/context boundary, not a generic library helper.

When wiring happens:
- Update all imports that still point at `src/lib/auth.tsx`.
- Keep hooks thin. They should adapt controllers and context to React, not become a second service layer.
