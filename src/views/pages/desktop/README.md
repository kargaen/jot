# Desktop Page Views

Desktop window surfaces live here.

Current note:
- The old `src/windows` folder was flattened into feature-specific desktop page folders.

When wiring happens:
- Update all imports that still reference `src/windows/*`.
- Decide whether `AboutWindow` and `Preferences` should stay standalone or become subviews of the dashboard shell.
