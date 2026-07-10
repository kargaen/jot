# 1. Architecture Philosophy

The MVC split in Jot maps to three clear layers:

| Layer          | Where it lives                                                              | Responsibility                                                                        |
| -------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Model**      | `src/models/`, `src-tauri/src/models/`, `supabase/migrations/`, `shared/`   | Shape of data — TypeScript interfaces, Zod schemas, Rust structs, SQL schema          |
| **View**       | `src/views/`                                                                | Pure presentation — React components that receive props and emit events, nothing else |
| **Controller** | `src/controllers/`, `src-tauri/src/commands/`, `src-tauri/src/controllers/` | Business logic — orchestrates models, calls services, drives view state               |

Services (`src/services/`) sit beneath the controller layer and handle all I/O: Supabase queries, Tauri `invoke()` bridges, and NLP parsing. Controllers call services; views never call services directly.
