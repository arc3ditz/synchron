# Synchron — Product Capability Audit & Implementation Plan

**Date:** 2026-10-27
**Branch:** `continuity-update` @ `6ce9b80` (+ large uncommitted working tree — see §6.1)
**Scope:** Read-only audit. No application files were edited, no dependencies installed, no commits made, no features implemented.

---

## §1 — System Architecture & Data Model Audit

### 1.1 Runtime shape

| Layer | Technology | Reality |
|---|---|---|
| Shell | Tauri v2 (`src-tauri/`) | `src-tauri/src/lib.rs:1-14` is a **template stub** — one `greet` command plus `tauri_plugin_opener`. **Zero application logic in Rust.** No file I/O, no IPC surface, no backend persistence. |
| UI | React 19 + TypeScript 6 + Vite 8 | All product behaviour lives here. |
| Persistence | `window.localStorage` | Two keys: `synchron.projects.v1`, `synchron.actions.v1`. Synchronous, single-device, ~5 MB origin cap, no history. |

**Consequence:** Synchron is currently a **local-first, single-window, purely frontend application**. There is no server, no database, no IPC contract, and no async anywhere in the data path.

### 1.2 Layer map

| Layer | Files | Responsibility |
|---|---|---|
| Pure stores | `src/projectStore.ts` (575), `src/actionStore.ts` (357) | Entity shapes, `normalize*` on load, validation, pure record transforms, localStorage read/write |
| Derived selectors | `src/homeOverview.ts` (276), `src/projectActivity.ts` (209), `src/sections.ts` (65), `src/dates.ts` (45) | Pure functions: continue-project selection, attention ranking, next-action ranking, activity rollups, date math |
| React controllers | `src/hooks/useProjects.ts`, `src/hooks/useActions.ts` | `useState` + a single `commit()` that persists; expose CRUD returning `{ ok, error }` |
| UI | `src/components/ProjectsCanvas.tsx` (2,660), `HomeCanvas.tsx` (392), `ContentCanvas.tsx`, `ActionViews.tsx` (431), `Overlays.tsx` | Rendering, DOM-target navigation, dialogs/popovers |
| Shell | `src/App.tsx` (213) | Section routing, `activeId`, cross-surface navigation, keyboard shortcuts |
| Verification | `scripts/verify-*.ts` (7 suites) | Pure-logic behavioural spec — **all 7 pass**; `tsc --noEmit` is clean |

### 1.3 Entity model

```ts
// src/projectStore.ts:43-57
Project {
  id, name, description, currentFocus?,
  resume?: { note, createdAt, updatedAt },
  status: "active" | "archived",
  createdAt, updatedAt, archivedAt?,
  notes: ProjectNote[], decisions: ProjectDecision[]
}

// src/actionStore.ts:8-29
Action {
  id, title, status: "open" | "completed",
  createdAt, updatedAt, dueDate?,
  importance: "low" | "medium" | "high",
  effortMinutes?, focusedDate?, completedAt?, projectId?
}

ProjectNote      { id, title, content, createdAt, updatedAt }
ProjectDecision { id, statement, rationale, createdAt, updatedAt }
InboxItem       { id, title, createdAt }   // project chosen at conversion time, not at capture
```

### 1.4 Architectural strengths — preserve these

1. **One canonical source of truth.** Actions live only in the action store; `projectId` is a *reference*, never a copy. Notes and decisions live inside the project record. Asserted at `verify-project-context.ts:341,361-365`, `verify-project-resume.ts:233-235`, `verify-action-projects.ts:124-125`.
2. **Deterministic derived state.** `selectNextOpenAction` ranks open actions with a stated human reason (`"Overdue"`, `"Due today"`, `"In today's focus"`, `"Critical importance"`, `"Oldest open action"`). The UI never invents urgency.
3. **Normalize-on-load is the single migration seam.** `normalizeProject` / `normalizeAction` drop malformed records, de-duplicate by id (first wins), and already migrate legacy `important: boolean` → `importance: "high"` without fabricating a due date.
4. **Pure record transforms + one write.** Mutations return new objects; no-ops return the *same object identity* (enabling React referential-equality short-circuits); a single `commit()` persists.
5. **Destructive operations are honest.** Deleting a project **detaches** its actions rather than cascading (`useProjectDelete` → `actions.detachProject`), and the confirmation copy states exactly what is kept vs. deleted (`describeProjectDeletion`).
6. **One anchor scheme for navigation.** DOM ids follow `project-action-<id>` / `project-note-<id>` / `project-decision-<id>` / `project-resume-note`. Home reuses it explicitly — `verify-home-overview.ts:253-256` asserts the target "is the established project-action anchor, not a second scheme".
7. **The resume note is user-authored only.** Nothing machine-generates it, and the activity feed never copies its wording (`verify-project-activity.ts:219-223`).

### 1.5 Model weaknesses

| # | Weakness | Evidence |
|---|---|---|
| M1 | **No visit / last-opened field.** `Project` has no `lastOpenedAt`. "Where you left off" is inferred from *edit activity*, not from *navigation*. | `src/homeOverview.ts:121-138`; `verify-home-overview.ts:93-96` — "the most recently active eligible project is the one to continue" |
| M2 | **Binary project lifecycle.** `"active" \| "archived"` only. No "on hold", no "completed". | `src/projectStore.ts` `ProjectStatus` |
| M3 | **No relationship fields between context entities.** Notes and decisions have no `relatedIds`; `Action` has only `projectId`. | `ProjectNote` / `ProjectDecision` shapes |
| M4 | **Actions are title-only.** No description body; task detail must live in a separate note. | `src/actionStore.ts:8-29` |
| M5 | **No cross-project query surface.** Notes/decisions are reachable only through their project. | grep: no search/filter implementation anywhere in `src/` |
| M6 | **Synchronous single-key persistence.** No write history, no write-time migration, no multi-device. | `commit()` in both hooks |
| M7 | **`detachProjectActions` has no rewind guard**, unlike `touchProjectsRecord`. | `src/actionStore.ts:213-227` vs `verify-project-activity.ts:165-168` |

---

## §2 — Gap Analysis per Product Goal

Legend: ✅ works and is verified · ⚠️ partial · ❌ genuine gap.

### Goal 1 — Continue work effortlessly

| Capability | | Evidence |
|---|---|---|
| Current focus | ✅ | `Project.currentFocus`; editable inline and in the combined edit form; surfaced on Home, index row, Overview |
| Resume note | ✅ | `Project.resume.note`; user-authored; shown on Home continue card and Context section |
| Next useful task | ✅ | `selectNextOpenAction` — deterministic, always carries a reason; used by Home, Overview, Tasks |
| Recent decisions & context | ✅ | Home "Recent context"; project Resume "Worth remembering"; Context "Recent activity" |
| Empty-project handling | ⚠️ | Overview says "No open actions yet. Add one to give this project a next step." But an empty project that is *not* the continue project is **invisible** — nothing surfaces it anywhere |
| **Return to a project after leaving it** | ❌ | **No `lastOpenedAt` (M1).** Read-only browsing of project B does *not* make B the continue target — activity does. This is the single largest Goal-1 gap |
| **The one thing to do right now** | ⚠️ | Home shows a next action *per card*, but never answers "if I only do one thing, what is it?" across projects |

### Goal 2 — Keep everything organized

| Capability | | Evidence |
|---|---|---|
| Tasks | ✅ | Full CRUD; due date, importance, effort, focus-today, complete/reopen, project link; active/completed/all filter |
| Notes | ✅ | CRUD title+content; nested in project; newest-first; "Show all N" |
| Decisions | ✅ | CRUD statement+rationale (both required); nested; newest-first |
| Background / context | ✅ | `Project.description` + resume note + recent activity |
| **Find a note or decision** | ❌ | **No search anywhere in `src/`.** Only `querySelector` DOM calls and one `matchMedia` in `useTheme.ts`. Not project-scoped, not global |
| **Relate context to work** | ❌ | No `relatedIds` on any entity (M3). `NoteItem` (`ProjectsCanvas.tsx:1450+`) renders title/content/operations only |
| **Order context deliberately** | ❌ | Notes/decisions sorted by `updatedAt` desc only. No pinning, no manual ordering |
| **Bulk organization** | ❌ | No multi-select, no bulk reassign/delete/archive |

### Goal 3 — Understand all projects

| Capability | | Evidence |
|---|---|---|
| Status model | ⚠️ | Binary active/archived only (M2). The index row shows an archived date for archived projects and nothing else for status |
| How much work remains | ⚠️ | Only an **open action count** (`ProjectRow` detail, `ProjectsCanvas.tsx:299-311`). No total, no completed-vs-open |
| Which have actionable next steps | ❌ | The index row shows focus + open count but **not the next action's title**. Scanning the list does not tell you what to do in each project |
| Which may need attention | ✅ | Home "Needs attention" — three mutually-exclusive reasons: `overdue`, `no-next-action`, `quiet` (14 days) |
| Which made progress / went inactive | ⚠️ | "quiet" covers inactivity. Completed-action counts exist in the data but are **never surfaced** |
| Portfolio view of all projects | ❌ | No grouping by status or health. The index filter is active/archived/all; the sort is by recent activity only |

### Goal 4 — Connect everything together

| Capability | | Evidence |
|---|---|---|
| Home → project with deep target | ✅ | `openProject(projectId, targetId)` → `App.tsx:152` → `sectionForTarget` → `jumpToTarget` |
| Overview → note / decision | ✅ | "Worth remembering" / "Recent context" entries reveal their target section |
| Activity → item | ✅ | `projectActivity.ts` rolls up project, note, decision and action events; entries link to targets |
| Action → project backlink | ⚠️ | The project name appears in an action row, but as an **editable `ProjectPicker` control**, not a navigable link. No click-through |
| Stable anchor convention | ✅ | `project-action-*`, `project-note-*`, `project-decision-*`, `project-resume-note` |
| **Cross-project linking** | ❌ | A note in project A cannot point at project B, a decision, or a task (M3) |
| **Global "all context" view** | ❌ | Actions are global; notes and decisions are project-only (M5) |
| **Deep links / route state** | ❌ | `activeId` is React state (`App.tsx:46`). No URL, no window-title sync, no back/forward. Reload returns to Home |
| **Search across everything** | ❌ | None |

---

## §3 — Highest-Impact Opportunities

Ranked by product leverage ÷ blast radius, given the constraint *preserve what works*.

### O1 — Make "where you left off" literally true (Goal 1) · **highest leverage, smallest diff**
Add `lastOpenedAt` to `Project`, stamp it when a project is opened, and have `selectContinueProject` prefer a recently **visited** project, falling back to activity when no visit exists. Roughly a dozen lines across the model, one hook, one selector, one new suite. Removes the gap where reading project B does not make B your next stop.

### O2 — Answer "what is the one thing to do right now?" (Goal 1)
Home currently shows a continue card and an attention list but never a single answer. Rank every project's next action with the **existing** `selectNextOpenAction` reason logic and surface the single best one at the top of Home. No new data model — pure derived logic in `homeOverview.ts`, matching the existing pure-selector pattern.

### O3 — Search (Goals 2 & 4) · **largest organizational gap**
Nothing is findable once you have more than ~20 notes. Needs a pure `src/search.ts` query function (project name, note title/content, decision statement/rationale, action title), a search field in the workspace, and a global results surface. Results must be **references** into the existing stores — never a second copy of the data.

### O4 — Give projects a real lifecycle (Goal 3)
Add `"on hold"` and `"completed"` alongside `active`/`archived`. Unlocks "which projects are paused", "which are done", and removes a false binary in which "not currently working on" and "finished forever" are the same state. Requires a `normalizeProject` migration path (already exists) and a 4-way index filter.

### O5 — Honest project health at the index (Goal 3)
Surface per row: the **next action's title** (one truncated line), `open · completed` counts, and last-activity date. Use counts and dates — **not** a synthetic percentage. The brief is explicit that misleading progress metrics are worse than none.

### O6 — Link context to work (Goal 4)
Add optional `relatedActionIds` to notes and decisions, with a picker limited to the project's own actions, rendered as jump links using the existing anchor convention. This is what makes a decision and the task it produced feel connected.

### O7 — Make the action → project name a real link (Goal 4)
In the global Actions list, let the project name navigate to the project while the picker remains the edit affordance. Small, reuses the existing `openProject(id, target?)` path.

### O8 — Close the verification blind spot (enables all of the above)
Every one of the 7 suites is pure-logic; **nothing mounts React or queries the DOM**. The DOM anchor contract is guaranteed at the *string* level only. This is exactly where the live regression in §6.2 hides. A DOM-level layer for the anchor contract, plus an aggregate runner, is what makes the rest of this plan safely verifiable.

---

## §4 — Prioritized Implementation Plan

### Phase 0 — Stabilize the in-flight work (do this first, before any feature work)

The working tree carries **16 modified files + 4 untracked files (~1,637 insertions / 458 deletions)** on `continuity-update`, entirely uncommitted. This is a coherent, near-complete redesign of the Project Workspace and the new Home surface — it is *not* work to redo. It is also the most fragile thing in the repo.

1. Commit the tree **as-is** on `continuity-update`. Do not rewrite, reformat, or "fix while committing."
2. Record the baseline gate: all 7 `check:*` scripts pass, `npx tsc --noEmit` is clean, `npm run build` succeeds.
3. Treat §1.4 (strengths), the anchor-id contract, and the shared `ProjectMenuActions` / `useProjectDelete` primitives as the **frozen contract** for Phases 1-7. Build on them; do not introduce parallel mechanisms.

### Phase 1 — Fix the live regression (Goal 1, correctness) · *do before anything else*

The Context section's **"Add an action"** button is a silent no-op. `ProjectResume.focusActionForm` (`ProjectsCanvas.tsx:1100-1105`) looks up `document.getElementById(actionFormInputId)`, but the only element with that id is the `ActionForm` input, which renders **inside `ProjectActions`** — which renders **only under `section === "tasks"`** (`ProjectsCanvas.tsx:621-625`, `2495-2503`). `ProjectResume` renders only under `section === "context"` (`2523-2534`). The branches are mutually exclusive, so the lookup returns `null` and the button does nothing.

This worked before the redesign, when both components were siblings on one always-rendered page.

**Fix:** move the affordance out of `ProjectResume` into a section-aware handler — the Overview already does exactly this via `onAddTask={() => goToTasks(actionFormInputId)}` (`ProjectsCanvas.tsx:2489`). Reuse `goToTasks`; do not add a second navigation path.

**Acceptance:** from the Context section, the button switches to Tasks and focuses the action input. Add a DOM-level assertion (see Phase 1b).

### Phase 1b — Add a DOM-level verification layer (enabler)

The 7 existing suites are all pure-logic. Nothing proves that a component actually emits `id="project-note-<id>"`, that section switching reveals the right body, or that a button navigates.

- Add `scripts/verify-dom.ts` with a minimal DOM harness (the project has no jsdom/vitest — decide deliberately between adding a devDependency and a hand-rolled minimal shim; a shim is sufficient for the anchor/id contract and avoids adding a dependency).
- Assert the anchor contract: `project-action-*`, `project-note-*`, `project-decision-*`, `project-resume-note` are actually rendered, and `sectionForTarget` maps each to the section that renders it.
- Assert the Phase 1 fix: the Context "Add an action" control reaches the Tasks input.
- Add an aggregate `npm run check` that runs all suites in sequence.

**Acceptance:** `npm run check` runs every suite green; the D1 regression fails it if reintroduced.

### Phase 2 — Continuity truth (Goal 1) · highest leverage

1. `Project.lastOpenedAt?: string`; handle it in `normalizeProject` (default `undefined`, never fabricate).
2. Stamp it when a project is **opened** — not on every render, not on edit.
3. `selectContinueProject` prefers `lastOpenedAt`, falls back to `projectLastActivityAt`.
4. Preserve the existing eligibility rule exactly: a project is offered only with a resume note, a current focus, or its own open action; archived projects never are (`verify-home-overview.ts:79-80,99-115,196-199`).

**Acceptance:** new `check:project-visit` suite — open project B read-only, then Home names B as the continue target; existing `check:home-overview` still passes unchanged.

### Phase 3 — One "do next" answer (Goal 1)

5. `selectTopNextAction(projects, actions)` in `src/homeOverview.ts` — rank using the existing per-project next action and its reason; deterministic tie-break by name then id.
6. Render it as the primary element at the top of Home, above the continue card.
7. Respect the existing cap conventions (`HOME_ATTENTION_LIMIT = 4`, `HOME_CONTEXT_LIMIT = 5`, `PROJECT_ACTIVITY_LIMIT = 6`).

**Acceptance:** extend `check:home-overview` with a deterministic-ranking assertion; the copy must state *why* this action was chosen (reuse the existing reason vocabulary).

### Phase 4 — Project lifecycle states (Goal 3)

8. `ProjectStatus = "active" | "on hold" | "completed" | "archived"`.
9. `normalizeProject` maps any unknown status → `"active"`; existing records migrate with no data loss. Archived keeps its current treatment (`archivedAt`, muted row).
10. Index filter becomes a 4-way control. `archived` and `completed` remain readable and distinct; only `archived` is read-only.
11. Extend `check:projects` for status transitions, archive/restore from `on hold`, and the unknown-status migration.

**Acceptance:** `check:projects` covers every legal transition and rejects illegal ones.

### Phase 5 — Honest health at the index (Goal 3)

12. Project row gains: the next action's title (one truncated line), `open · completed` counts, and last-activity date.
13. **No percentage, no progress bar, no synthetic score.** Counts and dates only.
14. Archived rows show their archived date instead; the row keeps its current hairline editorial treatment.

**Acceptance:** extend `check:projects` for the derived row values; DOM-level assertion in `verify-dom` for their presence.

### Phase 6 — Search (Goals 2 & 4) · largest phase

15. `src/search.ts` — pure `searchWorkspace(query, { projects, actions })` returning typed result references (ids + kinds), matching project name, note title/content, decision statement/rationale, action title. Case-insensitive; empty query → no results.
16. Workspace-scoped search field in the workspace header.
17. A global results surface reachable from the shell as a **new top-level section** (this is a new section, not a Settings change).
18. Results navigate through the existing anchor convention, so a search hit lands on the item, not merely its project.

**Acceptance:** new `check:search` suite covering every field kind, case-insensitivity, empty query, no-match state, and that results reference existing ids rather than copies.

### Phase 7 — Link context to work (Goal 4)

19. Optional `relatedActionIds?: string[]` on `ProjectNote` and `ProjectDecision`; absent means "no links", never `null` (match the existing unlink convention).
20. A link picker in the note/decision form, limited to the project's own actions.
21. Links render as jump links via `projectActivityTargetId`.
22. Deleting an action must not strand a note: either drop the link or keep it as a plain label — decide and pin it with a test.

**Acceptance:** new `check:project-links` covering add/remove/round-trip, migration of legacy records with no `relatedActionIds`, and the deletion behavior chosen in (22).

### Phase 8 — Make the action → project a link (Goal 4)

23. In the global Actions list, the project name becomes a navigable link to the project; the picker remains the edit affordance. Both remain accessible and keyboard-reachable.

**Acceptance:** DOM-level assertion in `verify-dom`.

### Phase 9 — Small cleanup (do opportunistically)

24. Remove dead CSS `.project-detail__archive` / `.project-detail__delete` (`Projects.css:277-285`) — the header buttons they styled were replaced by the overflow menu.
25. Add a rule for `.project-overview__heading-title` (used 3× in TSX, no CSS rule) or rename it to match its siblings.
26. Remove the unreachable `emptyTitle` / `emptyBody` for the `home` section (`sections.ts:26-28`) — `ContentCanvas.tsx:105` returns the `HomeCanvas` branch before the fallback is reachable.
27. Align `detachProjectActions` with `touchProjectsRecord`: guard against rewinding `updatedAt`. Note `verify-action-projects.ts:159` currently *pins* the rewind behavior — change that assertion deliberately, not silently.
28. Either cover `describeNextAction` or remove its unused import at `verify-project-resume.ts:34`. It is currently imported and never called — the only unguarded helper in the suite.

### Explicitly OUT of scope

- **Any external integration** (see §5).
- **A generic repository/abstraction layer** over the stores.
- **A percentage-based progress metric.**
- **Any change to Settings** (`sections.ts` "settings" entry stays as-is).
- **Bulk multi-select operations** — lowest leverage per unit of risk; defer.
- **Deep-link / URL routing** — a desktop app does not need it; if added later it must not disturb the anchor convention.
- **Rewriting the in-flight workspace redesign** — it is the delivered baseline.

---

## §5 — Architectural Prerequisites for Future External Integrations

Current reality: `src-tauri/src/lib.rs` is a stub with one `greet` command. There is no backend, no filesystem persistence, no IPC contract, and no async in the data path. The store layer is synchronous pure functions plus a `localStorage` write.

If external integrations are ever pursued (calendar, email, issue tracker), **none of the following prerequisites exist today**, and they would have to be built in this order:

1. **An async-capable persistence boundary.** `commit()` is synchronous `localStorage`. An integration needs a sink it can await and whose failures it can surface. The natural seam: the pure record transforms (`updateProjectRecord`, `updateActionRecord`) are already the right unit of work and need **no** change — replace only the *sink*. This is the single most important property of the current design and must not be given up: keep the pure core pure.
2. **A stable external-id mapping.** No entity carries an external id. Add optional `externalRefs?: { source, id }[]` per entity rather than provider-specific fields, so one entity can be linked from several sources without a schema per integration.
3. **A provenance and conflict rule.** `updatedAt` is a single local clock. Two-way sync needs a per-source sync watermark and an explicit conflict policy. Last-write-wins by `updatedAt` is the simplest defensible default — but it must be a *decision*, and note that `detachProjectActions` already shows how timestamps can move backwards (§4.27).
4. **An inbound path that reuses the existing validation.** Today UI → store is direct. Sync must apply inbound remote changes through the *same* `normalize*` and validation path the UI uses, so a remote record cannot bypass `normalizeProject` / `normalizeAction`. This means the inbound path must call the store's own mutation functions, never write to storage directly.
5. **A migration story beyond `.v1` keys.** `normalize*` on load is the existing migration seam and must remain the only place shape changes are interpreted, so a future `v2` key or a local database can slot in behind it.

**Recommendation: build none of this now.** There is no demonstrated need in the current product, the brief explicitly says not to introduce an abstraction layer without one, and every item above adds real complexity to a codebase that is currently simple and well-tested. Record these five items as the design brief for whenever an integration is actually required.

---

## §6 — Risks & Verification

### 6.1 Immediate risks in the working tree

| Risk | Severity | Detail | Mitigation |
|---|---|---|---|
| **Uncommitted work** | **High** | 16 modified + 4 untracked files (~1,637 insertions) on `continuity-update`. A crash, branch switch, or `git clean` destroys it. Nothing is committed. | Phase 0 — commit the tree as-is, untouched. |
| **Live regression (D1)** | **High** | The Context section's "Add an action" button is a silent no-op (`ProjectsCanvas.tsx:1100-1105` vs `2495-2503` / `2523-2534`). Introduced by the section split. | Phase 1, before any feature work. |
| **No DOM-level verification** | **High** | All 7 suites are pure-logic. Nothing mounts React or queries the DOM, so no rendered anchor, no focus behavior, and no navigation is guaranteed. D1 is exactly this class of bug and survived because it is invisible to the suite. | Phase 1b — a DOM layer + aggregate `npm run check`. |
| **Single-file size** | Medium | `ProjectsCanvas.tsx` is 2,660 lines holding the index, overview, context, resume, notes, decisions, background and the detail shell. Phases 4-7 all touch it → conflict surface. | Phases 2-3 first (they mostly touch stores/selectors). Consider extracting per-section components during Phases 5-6. |
| **Store coupling** | Medium | `projectStore.ts` holds projects, notes and decisions together; adding `relatedActionIds` (Phase 7) and a lifecycle status (Phase 4) widens an already broad module. | Keep all new entity fields **additive and optional** so `normalize*` can default them without migrating existing records. |
| **Timestamp rewind on detach** | Low–Medium | `detachProjectActions` (`actionStore.ts:213-227`) stamps `updatedAt` with no guard, unlike `touchProjectsRecord`. `verify-action-projects.ts:159` currently *pins* the rewind. Production always passes `now`, so it is latent, not live. | Phase 9.27 — align the two, and change the assertion deliberately. |
| **Unguarded helper** | Low | `describeNextAction` is imported at `verify-project-resume.ts:34` and never called anywhere. Nothing pins its output. | Phase 9.28 — cover it or drop the import. |
| **No CI, no aggregate runner** | Low–Medium | The 7 suites must be run one at a time; there is no `.github/workflows`. A single forgotten suite is a silent regression. | Phase 1b — add `npm run check` and wire CI. |
| **No visual regression harness** | Medium | The suites assert logic and DOM text, never layout or appearance. The redesign's visual claims are unverified. | Manual pass per phase, governed by `.agents/skills/apple-design/SKILL.md`. |
| **localStorage ceiling** | Low | Two keys, ~5 MB origin limit. Long-lived notes + activity could grow over years. | Not a blocker. Revisit only if notes grow large. |

### 6.2 Verification strategy

**Baseline established at audit time (all re-run and passing):**

```
npm run check:scheduling        → Scheduling checks passed.
npm run check:projects          → All project store checks passed.
npm run check:project-context   → All project context checks passed.
npm run check:project-resume    → All project resume checks passed.
npm run check:project-activity  → All project activity checks passed.
npm run check:action-projects   → All action ↔ project checks passed.
npm run check:home-overview     → All Home overview checks passed.
npx tsc --noEmit                → exit 0, zero errors
```

**Per phase:**

| Change type | How to verify |
|---|---|
| Store / selector logic | Extend the matching `scripts/verify-*.ts` suite (pure, runs in ~1s) and run `npm run check:<x>`. These scripts mock `localStorage` and import the store modules directly — no DOM needed. |
| Rendering / navigation | The DOM-level suite from Phase 1b: assert by DOM id / class, and that the target reveal lands. |
| Type safety | `npx tsc --noEmit`. |
| Full build | `npm run build` (`tsc && vite build`) before merging each phase. |
| Visual & interaction | Manual verification in the running Tauri app. The visual bar is Synchron's own: warm paper `#F5F1E8`, ink `#24231F`, restrained amber `#D96C42`, calm editorial hierarchy — no Liquid Glass, no glass-heavy styling, no nested-card clutter, no decorative gradients. Lucide React icons, consistent interactive targets, accessible contrast, keyboard support. |

**Invariant coverage matrix** — what each new phase must not break:

| Invariant | Guarded today by | New phases at risk |
|---|---|---|
| One storage key per store; project context lives inside the project record | `verify-project-context.ts:341,361-365`, `verify-project-resume.ts:233-235` | 4, 6, 7 |
| Persisting projects never mutates the action store | `verify-project-context.ts:341` | 4, 7 |
| A single navigation anchor scheme, reused by Home | `verify-project-activity.ts:231-239`, `verify-home-overview.ts:253-256` | 6, 7, 8 |
| Duplicate ids: first record wins | `verify-projects.ts:90`, `verify-project-context.ts:118,154` | 4, 6, 7 |
| Deleted/unlinked items leave no dangling references | `verify-project-activity.ts:340-364` | 7 |
| Deleting a project detaches actions, never deletes them | `verify-action-projects.ts:157-163` | 4, 7 |
| Archiving never detaches or discards actions | `verify-action-projects.ts:143-146` | 4 |
| Actions stay canonical; a missing project reference is preserved, not dropped | `verify-action-projects.ts:86-89,98,104-105` | 4, 7 |
| `createdAt` immutable on every edit path | `verify-project-context.ts:214,277`, `verify-project-resume.ts:154`, `verify-projects.ts:183` | 4, 7 |
| A project touch can never rewind `updatedAt` | `verify-project-activity.ts:165-168` | 9 |
| The resume note is user-authored only; the feed never copies its wording | `verify-project-resume.ts:174-175`, `verify-project-activity.ts:219-223` | 3, 7 |
| Project context never leaks between projects | `verify-project-context.ts:323-329`, `verify-project-resume.ts:196-201` | 4, 6, 7 |
| Selectors are deterministic and never mutate their inputs | `verify-project-resume.ts:312-321`, `verify-home-overview.ts:207-219` | 2, 3, 5, 6 |
| No-op mutations return the same object identity | `verify-projects.ts:126,138,146,153,192` and peers | 4, 6, 7 |
| Reason and label copy is pinned to exact literals | `verify-project-resume.ts:283-307`, `verify-home-overview.ts:243-356` | 3, 5, 6 |
| Home continue eligibility + reason precedence | `verify-home-overview.ts:79-80,99-115,348-360` | 2, 3, 4 |
| The continue project is not repeated in the attention list | `verify-home-overview.ts:362-367` | 2, 3, 4 |
| Blocked/corrupt storage never throws | `verify-projects.ts:241-243` and peers | all store changes |

### 6.3 Known unknowns — explicitly *not* guaranteed by the suite

Do not read these as working:

1. **Nothing renders.** No script mounts React, queries the DOM, or checks `aria-*`. The anchor contract is guaranteed as *strings* only — whether any component emits `id="project-note-<id>"` is unverified. (Phase 1b closes this.)
2. **No UI behavior is guaranteed** — focus management, keyboard support, popover positioning, dialog semantics, scroll behavior are all untested.
3. **The hooks layer is untested** — `useProjects.ts`, `useActions.ts`, `useTheme.ts` are outside the guaranteed surface, as are all components, `App.tsx`, `main.tsx`, `sections.ts`, and `dates.ts`.
4. **The Tauri bridge is untested** — no script touches IPC or the filesystem.
5. **Thresholds are pinned only at sampled points** — the Home context recency window, the 14-day "quiet" threshold, and `formatQuietSpan` are each tested at two or three values, not at their edges.
6. **Hard-coded caps are behavioral constants** — attention 4, context 5, activity 6. Any UI change must respect them, though the cap *names* are not asserted.
7. **Whether resume notes appear in Home context is unknown** — only `"Note"` and `"Decision"` kinds are asserted (`verify-home-overview.ts:392,406`).
8. **No concurrency, quota, cross-version migration, or export/import coverage** — only the `important → importance` legacy migration is covered.
9. **Nothing in the diff was verified in the running app** — the visual and interaction claims remain unconfirmed.

---

## Appendix — DOM anchor & class contract (frozen for Phases 1-8)

**Navigation anchors** — the only stable hard-coded ids; the app navigates by these:

| Id | Owner | Built at |
|---|---|---|
| `project-action-<actionId>` | action row `<li>` | `ProjectsCanvas.tsx:636,663,979,1219`; `projectActivity.ts:201` |
| `project-note-<noteId>` | note item | `ProjectsCanvas.tsx:1488`; `projectActivity.ts:203` |
| `project-decision-<decisionId>` | decision item | `ProjectsCanvas.tsx:1598`; `projectActivity.ts:205` |
| `project-resume-note` | resume note paragraph | `ProjectsCanvas.tsx:1188`; `projectActivity.ts:207` |

**Routing map** — `sectionForTarget` (`ProjectsCanvas.tsx:807-814`):
`project-note-*` → Notes · `project-decision-*` → Decisions · `project-action-*` → Tasks · `project-resume-note` → Context · anything else → Overview.

**Workspace sections** — `ProjectsCanvas.tsx:793-801`:
`overview` · `tasks` · `notes` · `decisions` · `context`.

**Shared primitives to reuse, not duplicate:** `ProjectMenuActions` (`:2009`), `useProjectDelete` (`:2074`), `describeProjectDeletion` (`:1986`), `ContextLinks` (`:114`), `sectionForTarget` (`:807`), `goToTasks` / `goToSection` (`:2209`), `projectActivityTargetId`, `AnchoredPopover` / `Tooltip` / `ConfirmationProvider` (`Overlays.tsx`).

**CSS conventions:** BEM-ish `block__element--modifier`. New workspace blocks: `workspace-nav`, `project-overview`, `project-edit`, `project-background`, `projects-index__header`, `project-row__menu-trigger`, `project-detail__menu-trigger`, `menu-option--delete`. New Home blocks live in `src/components/Home.css`: `home-header`, `home-capture`, `home-section`, `home-continue__*`, `home-attention__*`, `home-context__*`, `home-empty`.
