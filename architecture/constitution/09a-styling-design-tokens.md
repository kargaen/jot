# 9a. Styling & design system — design tokens

Design tokens are the **single source of truth** for color, radius, and shadow, and live as CSS variables in `src/styles/global.css` (`:root` for light; `:root[data-theme="dark"]` and the `prefers-color-scheme` block for dark). Components reference tokens via `var(--token)` — never hardcode hex/rgba in inline styles. Add or change a color in `global.css` only; because everything references the tokens, light/dark stay in sync automatically. (See `global.css` for the current token names.)

When you need a control, resolve it in this order (this is the concrete form of CLAUDE.md's "Avoid Custom Markup and Styling" principle):

1. **Reuse** an existing primitive in `src/views/components/ui/` that already does the job.
2. **Extend** that primitive — add a variant/size/prop — so the next caller benefits too.
3. **Compose** existing primitives + `var(--token)` styles.
4. **Custom, last resort only:** if none of the above fit, build a new token-driven primitive in `src/views/components/ui/` (never an inline one-off), and record it under **Key Conventions** per "Documenting New Conventions" in CLAUDE.md.

Never re-implement a button/input/spinner/toggle/chip inline when a primitive exists, and never copy a primitive's styles into a bespoke element.
