# Jot Roadmap

This roadmap reflects the current product direction: fast short-horizon task capture, strong defaults for most users, and advanced controls only when they clearly earn their place.

## Product Guardrails

- [x] Keep Jot focused on bite-sized tasks, not heavyweight work-package planning.
- [x] Do not add mixed Danish/English parsing. If we support multiple languages, users should be able to pick one intentionally.
- [x] Keep Pulse conceptually aligned across desktop and mobile.
- [x] Prefer defaults that work for 90% of users before adding customization for the remaining 10%.
- [x] Avoid feature work that mainly patches over states the app itself should prevent.

## Quick Wins

- [x] Finish strict NLP language mode.
  Desktop and mobile settings should let the user choose `Auto`, `English only`, or `Danish only`, and capture should honor that everywhere.
- [x] Tighten Pulse parity across desktop and mobile.
  Keep the same core framing, states, and voice so the feature feels like one product.
- [x] Add link support on tasks.
  A lightweight link field or smart URL detection adds real utility without turning tasks into documents.
- [x] Add project merge via drag-and-drop semantics.
  Dragging one project onto another can become the merge affordance, with a strong confirmation step.
- [x] Add a simple attachments spike.
  Validate storage costs, file-size limits, and sync ergonomics before committing to a bigger media feature.

## Medium Bets

- [ ] Refresh the default views model.
  Explore a stronger built-in set of views that feels natural out of the box, then layer optional saved views on top for power users.
- [ ] Add mobile project-sharing parity.
  Desktop project sharing is in place. Mobile can wait for now, but it should eventually support project invites and acceptance too.
- [ ] Expand deep-link routes for app handoff.
  Build on the confirmation flow so Jot can open directly into shared spaces, projects, and assignment-related surfaces from links.
- [ ] Add widget configuration.
  Let users choose which spaces feed Pulse and how Quick Capture should behave.
- [ ] Improve widget freshness feedback.
  Show last refresh timing and clearer stale states when Android delays updates.
- [ ] Add project drag-and-drop across spaces and within ordering.
  This should feel excellent and safe, not merely powerful.
- [ ] Add space-level policies.
  Examples: default project, widget eligibility, reminder behavior, archive defaults.

## Bigger Bets

- [ ] Outlook integration research.
  Validate what is realistically possible in Microsoft enterprise environments before promising anything.
- [ ] Adopt verified HTTPS app links / universal links.
  Replace the first-pass custom scheme flow with stronger mobile-friendly links once hosting and domain control are ready.
- [ ] Email capture research.
  Explore mailbox-to-Jot capture with strict scope and fallback parsing rules so it does not become an LLM dependency trap.
- [ ] Attachments as a monetizable feature.
  Start with low limits and strong defaults, then decide whether higher limits belong in a premium tier.
- [ ] Weekly review and reset flow.
  A lightweight ritual could help users clean up stale tasks and close loops without making Jot feel heavy.

## Open Product Questions

- [x] Tags: keep deferred unless we can prove clear use cases beyond search and occasional grouping. Right now they risk adding more complexity than value.
- [ ] Saved views: likely useful, but only after the built-in navigation feels complete without user setup.
- [x] Personal/work mode: any mode switch must remain fully generic and built on user-created spaces, not hardcoded assumptions.
