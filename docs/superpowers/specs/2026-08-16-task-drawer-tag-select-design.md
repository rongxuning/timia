# Task Drawer Tag Select Design

**Date:** 2026-08-16  
**Scope:** Web task create/edit drawer (`TaskDrawerWithComments`) workspace and project pickers  
**Out of scope:** iOS task editor; workspace/project card favorite toggles; changing how favorites are stored

## Goal

Replace the workspace and project `SystemSelect` dropdowns in the task create/edit drawer with a tiled tag row: up to 5 tags plus a `+` that opens the existing searchable dropdown. Default tiles prefer favorites, then newest `created_at`.

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| Surfaces | Web task create/edit drawer only; create and edit share the same component |
| Default tile order | Favorites first, then non-favorites; same group by `created_at` newest first |
| Create without context | Auto-select the first item in that order; show it first, then 4 more + `+` |
| Create from project page | Treat like edit: current workspace/project is first and selected |
| Edit | Task’s current workspace/project is first and selected |
| `+` pick not in the 5 tiles | Move that item to first, select it, then 4 more + `+` |
| Click a visible tag | Change selection only; do **not** reorder tiles |
| `+` pick already visible | Change selection only; do not reorder |
| Remaining 4 after a pin | From the base-sorted list with the first item removed |
| ≤ 5 options | Show all tags, hide `+` |
| Cascade | Unchanged: change workspace clears project/members; project list reloads |
| After workspace change | Project tiles reset as “create without context” for the new workspace |
| Data | Extend `GET /workspaces` and `GET /workspaces/{id}/projects` with `is_favorite` (+ `created_at` on workspaces); do not use card/dashboard aggregates |
| UI approach | New `PinnedTagSelect` + existing `SystemSelect` menu (search/keyboard unchanged) |

## Current behavior

- Drawer: `codes/web/src/components/TaskDrawerWithComments.tsx` (`variant`: `create` | `edit`).
- Pickers: two searchable `SystemSelect`s in a 2-column grid.
- Lists: `GET /workspaces` (already ordered favorite → `created_at` desc, but response omits those fields) and `GET /workspaces/{id}/projects` (`created_at` desc only, no favorite).
- Create without `workspaceId`: auto-select first workspace, then first project.
- Create on a project page: props prefill current workspace/project.
- Edit: load item, then set workspace/project from the item.
- Changing workspace/project can move the task on save (`target_workspace_id` / `target_project_id`).

## Interaction

Workspace and project each have their own tag row. Same rules. Still: pick workspace first, then projects in that workspace.

### Base sort (full list)

1. `is_favorite === true` before `false`
2. Same favorite flag: `created_at` descending
3. Stable tie-break: `id` descending (same as dashboard project cards)

### Two IDs

| ID | Meaning |
|----|---------|
| `selectedId` | Currently checked option (form value) |
| `anchorId` | Option that occupies tile slot 1 |

They start equal. Clicking a visible non-first tag changes only `selectedId`. Tiles stay `[anchor] + baseSortWithout(anchor)[:4]`.

### When `anchorId` is set

| Scene | `selectedId` and `anchorId` |
|-------|-----------------------------|
| Create, no workspace/project props | First item in base sort |
| Create on project page | URL/current workspace and project |
| Edit | Item’s workspace and project |
| `+` selects an option **not** in the current 5 tiles | The newly picked option |
| Options reload and current `anchorId` is missing | Fall back to `selectedId` if present, else first in base sort |

### Tile assembly

```
visible = [anchor] + baseSort.filter(id != anchor)[:4]
showPlus = totalOptions > 5
```

If `anchor` is missing from the loaded list, treat as no anchor and take `baseSort[:5]`.

### `+` menu

Same portal dropdown as today’s `SystemSelect`: search, keyboard, empty copy, selected checkmark. Lists **all** options (not only hidden ones). Search: workspace by name; project by name and description.

### Disabled / loading / empty

Unchanged: loading label; project disabled until a workspace is selected; empty copy stays “暂无可用工作空间” / “该工作空间下暂无可选项目” / “请先选择工作空间”.

## Layout

Five tags do not fit a half-width column. Stack the two fields full width (workspace, then project), not the current `sm:grid-cols-2`.

```
工作空间
[Tag] [Tag] [Tag] [Tag] [Tag] [+]

所属项目
[Tag] [Tag] [Tag] [Tag] [Tag] [+]
```

- Tags: wrap, pill shape, truncate long names.
- Selected: primary border / light primary fill.
- Unselected: existing chip chrome (`border-border-subtle`, `bg-surface-bright`).
- `+`: same-height circular control after the last tag; opens the menu.
- No star on tiles. Favorite only affects order.

## Data

### `GET /workspaces`

Keep current order (`WorkspaceMember.is_favorite desc`, `Workspace.created_at desc`). Always return:

- `created_at` (schema already has it; list handler currently omits it)
- `is_favorite` (new on `WorkspaceOut`, default `false` so create/update responses stay valid)

### `GET /workspaces/{workspace_id}/projects`

- Add `is_favorite` on `ProjectOut` (default `false` for create/update).
- Sort like dashboard cards: favorite first, then `created_at` desc, then `id` desc.
- `created_at` already returned.

Do not switch the drawer to `/workspaces/cards` or dashboard project cards.

After schema change: `make codegen`.

## Components

### `visiblePinnedTags(sorted, anchorId, max = 5)`

Pure function in `codes/web/src/lib/pinnedTags.ts`. Input is already base-sorted. Output is the tile list. Reuse `favoriteCardsFirst` in `cardSort.ts` for client-side sort (lists should already arrive sorted; client sort is a guard).

### `PinnedTagSelect`

New component used twice in the drawer.

- Props: same as `SystemSelect` plus options that include `is_favorite` and `created_at`.
- Owns `anchorId`. Reset when the option-id set changes (project list after workspace change) or when `value` is set from outside to an id not in the current tiles (edit load, project-page prefill).
- Tag click → `onChange` only.
- `+` click → open `SystemSelect` menu; if picked id is not in current tiles, set `anchorId` to that id then `onChange`.

### `SystemSelect`

Add an optional custom trigger so the default combobox button can be replaced by the `+` control. Do not fork search/keyboard/portal code.

## Unchanged

- Save / move-task PATCH fields
- Member, time, title, comments
- Favorite toggle APIs and card-page UI
- iOS `TaskEditorView` pickers

## Test / verify

- Backend: unit-test project list sort helper (favorite → `created_at` → id).
- Web has no unit-test runner; verify `pinnedTags` by inspection and the checklist below.
- `npx tsc --noEmit` in `codes/web`.
- `uv run ruff check .` in `codes/core-service`.

### Manual checklist

1. Global/schedule create: first tiles are favorite then newest; first tag selected.
2. Project-page create: current workspace and project are first and selected.
3. Edit a task whose workspace/project is not in the default top 5: that item is first and selected; next four follow base sort.
4. Click a non-first visible tag: selection moves, order stays.
5. `+` pick a hidden option: it becomes first and selected; previous first drops into the remaining four if it still ranks there.
6. `+` pick an already visible option: selection only.
7. Change workspace: project tiles rebuild; first project in the new workspace’s base sort is selected.
8. ≤ 5 options: no `+`.
9. Search in `+` menu still filters the full list.
