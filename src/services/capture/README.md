# Capture Services

Natural-language capture services belong here.

Current note:
- `nlp.service.ts` and `nlpSettings.service.ts` now live together so capture logic and capture preferences are visibly related.

When wiring happens:
- Update imports from the old `src/lib/nlp.ts` and `src/lib/nlpSettings.ts` paths.
- Consider separating deterministic parsing rules from settings persistence more explicitly.
