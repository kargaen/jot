# 7. Mobile view resolution

At runtime, a small resolver in `utils/platform.ts` returns `isMobile()`. The router lazy-imports the `.mobile.view.tsx` override when it exists, falling back to the default `.view.tsx`. This keeps mobile surfaces as thin deltas, not full copies.
