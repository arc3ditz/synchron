# Synchron

Synchron is a local-first personal productivity app for habits, deep work, and long-term planning. It combines daily habit tracking with a structured planning hierarchy and a built-in focus timer, packaged as a lightweight desktop app with Tauri.

All data stays on your machine via local storage. No account, no backend.

## Core features

- **Habits** — daily habits with Mandatory / Optional priority, custom frequencies (daily, weekdays, weekends, custom days), time blocking, streaks, streak freezes, archiving, and categories.
- **Project → Milestone → Task planning** — optional projects group milestones and actionable tasks.
- **Focus timer** — Pomodoro-style focus sessions linkable to a habit, task, project, or milestone, with session history.
- **Today view** — what matters now: due habits, scheduled items, and focus entry point.
- **Analytics & History** — completion rates, streaks, and historical review.
- **Notifications** — configurable intelligent reminders (conservative / balanced / frequent).
- **Themes** — dark and light modes.

## Planning workflow

```
Project → Milestone → Task
```

1. **Project** — an optional scoped effort (e.g. "Base training block"). Has its own dates and progress.
2. **Milestone** — a checkpoint inside a project (e.g. "Run 10K without stopping").
3. **Task** — the smallest actionable unit. Tasks (and habits) can optionally be the target of a focus session.

Habits run alongside this hierarchy for recurring daily execution; tasks and milestones handle one-off progress. All three work standalone — links are always optional.

Legacy Goal data stored on this machine (if any) is preserved but no longer shown; no Goal links are created, migrated, or deleted by the app.

## Habits and Focus

- Habits support frequencies, streaks, and optional scheduled time + duration for time blocking.
- Completing habits feeds Today progress, Analytics, and streak badges.
- The Focus timer supports configurable durations, quick-adjust steps, and sound/SFX toggles.
- A focus session can be linked to a specific habit or task so deep-work time is attributed to the right item.

## Platform requirement

Synchron ships as a desktop app via [Tauri](https://tauri.app/) (v2).

- **macOS (primary):** Xcode Command Line Tools + Rust stable (via `rustup`).
- **Other platforms:** Tauri prerequisites for your OS (see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/)).

The web frontend (`npm run dev`) works in a browser for development, but native features (notifications, bundling) require the Tauri shell.

## Development setup

Prerequisites: Node.js (LTS), npm, Rust stable.

```bash
npm install
```

Run the frontend only (browser):

```bash
npm run dev
```

Run as a desktop app (Tauri):

```bash
npm run tauri dev
```

## Commands

| Command              | Purpose                              |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start Vite dev server                |
| `npm run build`      | Type-check (`tsc -b`) + production build |
| `npm run preview`    | Preview the production build locally |
| `npm run lint`       | Run ESLint                           |
| `npm test`           | Run Node test suite (`tests/`)       |
| `npm run tauri dev`  | Run desktop app in development       |
| `npm run tauri build`| Bundle the desktop app               |

## Releases

Pushing a tag matching `v*` (e.g. `v0.6.1`) triggers `.github/workflows/build.yml`, which builds Tauri bundles for macOS (universal) and Windows and attaches them to a draft GitHub release.

Every push and pull request runs `.github/workflows/ci.yml` (install, tests, production build).
