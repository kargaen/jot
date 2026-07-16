# 11a. Data export — single-serializer convention

`src/models/export/jotExport.ts` is the **single source of truth** for how tasks leave Jot — the JotExport v1 JSON schema and the `serializeTasks` function. It is deliberately dependency-free so it runs unchanged in the app (Vite/browser) and in a Deno edge function (imported by relative path with a `.ts` extension). Every surface that exports or extracts tasks — the in-app "copy as JSON" action and the `conduit` edge function — must go through this module. Never hand-roll a second serialization format.

Derived human-readable presentations (e.g. Markdown for clipboard) are permitted provided they are rendered from `serializeTasks`' output and add no second data source of truth; the machine contract remains JSON.
