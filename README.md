# Jot

Jot is a calm, fast task app for short-horizon work.

Its mission is simple: help people get a real task out of their head and into a trusted system in seconds, then help them act on what matters today without turning life into a heavyweight planning ceremony.

## Mission

Build the fastest, clearest path from "I should remember this" to "I know what to do next."

Jot exists for the space between chaos and bureaucracy. It is for people who want more structure than sticky notes, but less ceremony than traditional project-management software.

## Brilliant Basics

- Capture should feel instant. A task should be saveable in a few seconds, ideally in one line.
- The app should reduce mental load, not add it. Defaults matter more than configuration.
- Today should be obvious. Users should be able to tell what needs attention without decoding a system.
- Structure should stay lightweight. Spaces, projects, due dates, priorities, and links should clarify work, not bury it.
- Natural language should feel trustworthy. If Jot understands input, it should do so intentionally and predictably.
- Mobile and desktop should feel like the same product, not two unrelated interpretations.
- The app should feel calm. Fast does not have to feel frantic.

## Epics

- Make capture frictionless across desktop, mobile, widgets, and quick-entry surfaces.
- Turn "today" into a useful operating mode, not just a date filter.
- Support lightweight collaboration without bloating the product into enterprise project software.
- Build strong defaults for most people before layering on power features.
- Create a product that helps users finish, not just collect.

## In One Paragraph

Jot is not trying to be a full work-management suite. It is trying to be exceptionally good at personal and small-team task flow: quick capture, clear daily focus, lightweight organization, and enough collaboration to stay useful when work is shared. If a feature makes the app slower, noisier, or more ceremonial, it needs a very strong reason to exist.

## What Jot Is For

- Capturing tasks the moment they appear
- Planning the next few days, not the next fiscal year
- Keeping personal and work contexts separate through spaces, not through artificial modes
- Seeing overdue, due-today, inbox, and project work clearly
- Sharing projects and responsibility where it adds clarity
- Preserving momentum when people are busy, distracted, or switching devices

## What Jot Is Not For

- Heavyweight project governance
- Complex dependency mapping and work-package administration
- Endless customization before the app becomes useful
- Feature sprawl that mainly compensates for weak defaults
- "Productivity theater" where users spend more time tending the system than doing the work

## Product Philosophy

### 1. Speed Is A Feature

Jot should feel faster than the thought it is trying to save. Quick capture is not a side feature. It is the front door to the entire product.

### 2. Clarity Beats Flexibility

A smaller number of well-chosen views is better than infinite setup. Users should get value immediately, without first designing their own workflow architecture.

### 3. Lightweight Does Not Mean Shallow

Jot should stay small in ceremony, not in usefulness. A task can still have real context: due dates, links, priorities, spaces, projects, recurrence, attachments, and collaborators. The difference is that these details should feel available, not mandatory.

### 4. Shared Work Should Still Feel Human

Collaboration in Jot should preserve the app's calm character. Shared spaces, project invites, and responsibility should help people coordinate without making the product feel managerial or punitive.

### 5. The Product Should Help People Finish

Capture matters, but completion matters more. Pulse, reminders, daily focus, and future review flows should always push the product toward action, closure, and relief.

## The User Experience We Want

When someone opens Jot, they should feel:

- "I can put this somewhere immediately."
- "I understand what matters right now."
- "This app is helping me narrow the field, not widen it."
- "I don't need to fight the tool to stay organized."
- "I can trust this system enough to stop carrying everything in my head."

## Core Product Language

- `Task`: the basic unit of action
- `Space`: a broad context such as personal, work, family, or a team area
- `Project`: a grouping of related tasks inside a space
- `Pulse`: the app's daily-focus surface for today's meaningful work
- `Quick Capture`: the fastest path into the system, especially on desktop and widget surfaces

## Development North Star

When evaluating a new feature or refactor, ask:

1. Does this make capture faster, clearer, or more trustworthy?
2. Does this help users understand today more easily?
3. Does this keep the product lightweight in ceremony?
4. Does this preserve strong defaults instead of pushing setup onto the user?
5. Does this improve the feeling of calm control?

If the answer to most of these is "no", the feature probably does not belong yet.

## Practical Guardrails

- Prefer short-horizon task flow over long-horizon process management.
- Avoid mixed-language parsing ambiguity. Language support should be intentional.
- Preserve parity between desktop and mobile where the core experience matters.
- Add customization only after the default experience is already strong.
- Be suspicious of features that mostly patch over product states the app should prevent.

## Repository Context

This repository contains the Jot application and its supporting surfaces:

- A React-based UI
- A Tauri desktop shell
- Mobile-facing app surfaces
- Supabase-backed data and collaboration flows
- Natural-language task capture logic

The code should evolve in service of the mission above. Architecture, folder structure, tests, and feature decisions should all make the product's purpose easier to protect, not harder to see.

## Short Version

Jot is here to make task capture fast, daily focus clear, and organization calm.

That is the mission.
