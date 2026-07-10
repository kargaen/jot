# 4. Data flow (strict, one direction)

```
View  →  Hook  →  Controller  →  Service  →  (Supabase / Tauri / NLP)
                      ↓
                    Store
                      ↓
                    View (re-render)
```

Views never import from `services/` or `store/` directly.  
Controllers never import from `views/`.  
Services never import from `controllers/`, `store/`, or `views/`.
