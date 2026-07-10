# 6. Shared validation boundary

`shared/validation/schemas.ts` holds Zod schemas that are the **single source of truth** for data shapes. The Rust `models/` structs must stay in sync with these schemas — any schema change is a cross-layer change.
