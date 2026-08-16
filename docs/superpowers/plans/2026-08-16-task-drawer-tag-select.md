# Task Drawer Tag Select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Web task-drawer workspace/project dropdowns with 5 pinned tags plus a searchable `+` menu.

**Architecture:** List APIs gain `is_favorite` (and workspace `created_at`). A pure `visiblePinnedTags` helper plus `PinnedTagSelect` (tags + `SystemSelect` menu) replace the two drawer comboboxes. `anchorId` holds tile slot 1; `value` is the checked option.

**Tech Stack:** FastAPI/Pydantic/SQLAlchemy; Next.js/React/Tailwind; existing `SystemSelect` portal menu.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-16-task-drawer-tag-select-design.md`
- Web task create/edit drawer only; do not change iOS pickers or card favorite UI
- Do not use `/workspaces/cards` or dashboard project cards for the drawer
- Tile rule: `[anchor] + baseSortWithout(anchor)[:4]`; `+` only when `options.length > 5`
- Clicking a visible tag changes selection only; `+` pick of a hidden option re-anchors
- Project-page create is treated like edit (current workspace/project first)
- After workspace change, project tiles reset as create-without-context
- No `.ts` extensions in production imports
- After API schema change: `make codegen` from repo root
- Do not commit unless the user asked for a commit in this session

---

## File map

| File | Role |
|------|------|
| `codes/core-service/app/schemas/workspace.py` | Add `is_favorite` on `WorkspaceOut` |
| `codes/core-service/app/schemas/project.py` | Add `is_favorite` on `ProjectOut` |
| `codes/core-service/app/routes/workspaces.py` | Serialize `created_at` + `is_favorite` on list |
| `codes/core-service/app/routes/projects.py` | Favorite sort + `is_favorite` on list |
| `codes/core-service/app/services/project_sort.py` | **New** — favorite → `created_at` → id sort |
| `codes/core-service/tests/test_project_sort.py` | **New** — unit tests for that sort |
| `codes/web/src/types/api/generated.ts` | Regenerated OpenAPI types |
| `codes/web/src/lib/api/workspaces.ts` | Option types include `is_favorite` + `created_at` |
| `codes/web/src/lib/pinnedTags.ts` | **New** — client sort + tile assembly |
| `codes/web/src/components/SystemSelect.tsx` | Optional custom trigger for `+` |
| `codes/web/src/components/PinnedTagSelect.tsx` | **New** — tags + `+` menu |
| `codes/web/src/components/TaskDrawerWithComments.tsx` | Swap pickers; stack fields full width |

---

### Task 1: Backend list fields and project sort

**Files:**
- Create: `codes/core-service/app/services/project_sort.py`
- Create: `codes/core-service/tests/test_project_sort.py`
- Modify: `codes/core-service/app/schemas/workspace.py`
- Modify: `codes/core-service/app/schemas/project.py`
- Modify: `codes/core-service/app/routes/workspaces.py`
- Modify: `codes/core-service/app/routes/projects.py`

**Interfaces:**
- Consumes: `Project`, `ProjectFavorite`, existing list routes
- Produces: `sort_projects_favorite_then_created(projects, favorite_ids) -> list[Project]`; `WorkspaceOut.is_favorite`; `ProjectOut.is_favorite`

- [ ] **Step 1: Write the failing sort tests**

```python
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from app.services.project_sort import sort_projects_favorite_then_created


def _p(name: str, created_at: datetime, pid=None):
    return SimpleNamespace(id=pid or uuid4(), name=name, created_at=created_at)


def test_favorites_before_non_favorites():
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 8, 1, tzinfo=timezone.utc)
    fav = _p("fav", older)
    plain = _p("plain", newer)
    out = sort_projects_favorite_then_created([plain, fav], {fav.id})
    assert [p.name for p in out] == ["fav", "plain"]


def test_same_favorite_flag_newer_created_at_first():
    older = datetime(2026, 1, 1, tzinfo=timezone.utc)
    newer = datetime(2026, 8, 1, tzinfo=timezone.utc)
    a = _p("old", older)
    b = _p("new", newer)
    out = sort_projects_favorite_then_created([a, b], set())
    assert [p.name for p in out] == ["new", "old"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/core-service && uv run pytest tests/test_project_sort.py -q`

Expected: FAIL with `ModuleNotFoundError` or import error for `project_sort`

- [ ] **Step 3: Implement sort helper and schema/route fields**

`codes/core-service/app/services/project_sort.py`:

```python
from __future__ import annotations

import uuid
from typing import TypeVar

T = TypeVar("T")


def sort_projects_favorite_then_created(projects: list[T], favorite_ids: set[uuid.UUID]) -> list[T]:
    return sorted(
        projects,
        key=lambda project: (
            project.id in favorite_ids,
            project.created_at,
            str(project.id),
        ),
        reverse=True,
    )
```

On `WorkspaceOut` and `ProjectOut` add:

```python
is_favorite: bool = False
```

In `list_workspaces`, select membership favorite and pass `created_at` + `is_favorite`:

```python
rows = db.execute(
    select(Workspace, WorkspaceMember.is_favorite)
    .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
    .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "active")
    .order_by(WorkspaceMember.is_favorite.desc(), Workspace.created_at.desc())
).all()
return [
    WorkspaceOut(
        id=str(w.id),
        name=w.name,
        description=w.description,
        color=w.color,
        created_at=w.created_at,
        is_favorite=is_favorite,
    )
    for w, is_favorite in rows
]
```

In `list_projects`, after loading `rows` and before `_project_out`:

```python
favorite_ids = set(
    db.scalars(
        select(ProjectFavorite.project_id).where(
            ProjectFavorite.project_id.in_([p.id for p in rows]),
            ProjectFavorite.user_id == user.id,
        )
    ).all()
) if rows else set()
rows = sort_projects_favorite_then_created(rows, favorite_ids)
```

Pass `is_favorite=p.id in favorite_ids` into `_project_out` (add the argument; create/update callers omit it and keep default `False`). Empty `rows` must skip the `IN` query.

- [ ] **Step 4: Run sort tests and lint**

Run:

```
cd codes/core-service && uv run pytest tests/test_project_sort.py -q
cd codes/core-service && uv run ruff check app/schemas/workspace.py app/schemas/project.py app/routes/workspaces.py app/routes/projects.py app/services/project_sort.py tests/test_project_sort.py
```

Expected: tests PASS; ruff clean

- [ ] **Step 5: Commit (only if the user asked)**

```bash
git add codes/core-service/app/schemas/workspace.py codes/core-service/app/schemas/project.py \
  codes/core-service/app/routes/workspaces.py codes/core-service/app/routes/projects.py \
  codes/core-service/app/services/project_sort.py codes/core-service/tests/test_project_sort.py
git commit -m "$(cat <<'EOF'
feat: return favorite and created_at on workspace/project lists

EOF
)"
```

---

### Task 2: Codegen OpenAPI types

**Files:**
- Modify: `codes/core-service/openapi.json` (via export script)
- Modify: `codes/web/src/types/api/generated.ts`

**Interfaces:**
- Consumes: updated `WorkspaceOut` / `ProjectOut`
- Produces: generated `is_favorite` on both schemas

- [ ] **Step 1: Regenerate types**

Run from repo root: `make codegen`

Expected: `WorkspaceOut` and `ProjectOut` in `generated.ts` include `is_favorite?: boolean` (or required boolean, matching Pydantic default serialization)

- [ ] **Step 2: Commit (only if the user asked)**

```bash
git add codes/core-service/openapi.json codes/web/src/types/api/generated.ts
git commit -m "$(cat <<'EOF'
chore: codegen workspace and project favorite fields

EOF
)"
```

---

### Task 3: Frontend option types and tile helper

**Files:**
- Modify: `codes/web/src/lib/api/workspaces.ts`
- Create: `codes/web/src/lib/pinnedTags.ts`

**Interfaces:**
- Consumes: list JSON with `id`, `name`, `is_favorite`, `created_at`
- Produces:

```ts
export type WorkspaceOption = {
  id: string;
  name: string;
  description?: string | null;
  is_favorite: boolean;
  created_at: string;
};

export type ProjectOption = {
  id: string;
  name: string;
  description?: string | null;
  is_favorite: boolean;
  created_at: string;
};

export function sortFavoriteThenCreatedAt<
  T extends { id: string; is_favorite: boolean; created_at: string },
>(items: T[]): T[];

export function visiblePinnedTags<T extends { id: string }>(
  sortedItems: T[],
  anchorId: string | null,
  maxVisible?: number,
): T[];
```

- [ ] **Step 1: Extend option types**

In `workspaces.ts`, add `is_favorite: boolean` and `created_at: string` to both option types. Normalize in the fetch functions so missing API values become `is_favorite: false` and `created_at: ""`:

```ts
function asWorkspaceOption(row: WorkspaceOption): WorkspaceOption {
  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
    created_at: row.created_at ?? "",
  };
}
```

Same idea for projects. `ProjectModal` only uses `id` / `name` from `WorkspaceOption`, so extra fields are safe.

- [ ] **Step 2: Add tile helpers**

`codes/web/src/lib/pinnedTags.ts`:

```ts
export function sortFavoriteThenCreatedAt<
  T extends { id: string; is_favorite: boolean; created_at: string },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const favoriteOrder = Number(b.is_favorite) - Number(a.is_favorite);
    if (favoriteOrder !== 0) return favoriteOrder;
    const timeOrder = Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0);
    if (timeOrder !== 0) return timeOrder;
    return b.id.localeCompare(a.id);
  });
}

export function visiblePinnedTags<T extends { id: string }>(
  sortedItems: T[],
  anchorId: string | null,
  maxVisible = 5,
): T[] {
  if (sortedItems.length === 0) return [];
  const anchor = anchorId ? sortedItems.find((item) => item.id === anchorId) : undefined;
  if (!anchor) return sortedItems.slice(0, maxVisible);
  return [anchor, ...sortedItems.filter((item) => item.id !== anchor.id)].slice(0, maxVisible);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd codes/web && npx tsc --noEmit`

Expected: PASS (drawer still compiles; extra option fields are unused until Task 6)

- [ ] **Step 4: Commit (only if the user asked)**

```bash
git add codes/web/src/lib/api/workspaces.ts codes/web/src/lib/pinnedTags.ts
git commit -m "$(cat <<'EOF'
feat: add pinned tag sort helpers for task drawer lists

EOF
)"
```

---

### Task 4: Custom trigger on `SystemSelect`

**Files:**
- Modify: `codes/web/src/components/SystemSelect.tsx`

**Interfaces:**
- Consumes: existing menu/search/keyboard
- Produces: optional `renderTrigger` on `SystemSelect` props

```ts
export type SystemSelectTriggerState = {
  open: boolean;
  disabled: boolean;
  loading: boolean;
  selected: SystemSelectOption | null;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  toggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
};

// Props addition:
renderTrigger?: (state: SystemSelectTriggerState) => React.ReactNode;
```

- [ ] **Step 1: Add `renderTrigger` without changing default UI**

When `renderTrigger` is omitted, keep the current full-width combobox button. When provided, render `renderTrigger({ open, disabled, loading, selected, triggerRef, toggle, onKeyDown })` instead of that button. The portal menu, `updateMenuPosition`, and keyboard handlers stay the same and still use `triggerRef` for positioning (the `+` button).

`toggle` is `() => (open ? closePanel() : openPanel())`.

Keep the label above the trigger (`id={`${uid}-label`}`) so `PinnedTagSelect` can hide it with a new optional `hideLabel` if the parent already shows the field label — or pass `label` and let `PinnedTagSelect` use `SystemSelect` with `hideLabel`.

Add `hideLabel?: boolean` (default `false`). When true, do not render the label div; still set `aria-label={label}` on the trigger path.

- [ ] **Step 2: Typecheck**

Run: `cd codes/web && npx tsc --noEmit`

Expected: PASS; existing `SystemSelect` call sites unchanged

- [ ] **Step 3: Commit (only if the user asked)**

```bash
git add codes/web/src/components/SystemSelect.tsx
git commit -m "$(cat <<'EOF'
feat: allow SystemSelect to render a custom trigger

EOF
)"
```

---

### Task 5: `PinnedTagSelect`

**Files:**
- Create: `codes/web/src/components/PinnedTagSelect.tsx`

**Interfaces:**
- Consumes: `SystemSelect`, `sortFavoriteThenCreatedAt`, `visiblePinnedTags`
- Produces: `PinnedTagSelect` component

```ts
export type PinnedTagOption = {
  value: string;
  label: string;
  hint?: string;
  is_favorite: boolean;
  created_at: string;
};

type Props = {
  label: string;
  value: string | null;
  options: PinnedTagOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
};
```

- [ ] **Step 1: Implement the component**

Behavior:

1. `sorted = sortFavoriteThenCreatedAt(options mapped to { id: value, ... })` — keep `value` as the option id field by mapping `{ id: o.value, ...o }` or teach helpers to use `value`. Prefer mapping once:

```ts
const sorted = sortFavoriteThenCreatedAt(
  options.map((o) => ({ id: o.value, is_favorite: o.is_favorite, created_at: o.created_at, option: o })),
);
```

2. State `anchorId: string | null`.
3. Reset `anchorId` only when the option-id set changes, or when `value` is in options but not in the current tiles. Derive `sorted` with `useMemo`. Do not put `sorted` or `anchorId` in a wide effect that rewrites itself every render:

```ts
const optionKey = options.map((o) => o.value).slice().sort().join(",");
const sorted = useMemo(
  () =>
    sortFavoriteThenCreatedAt(
      options.map((o) => ({
        id: o.value,
        is_favorite: o.is_favorite,
        created_at: o.created_at,
        option: o,
      })),
    ),
  [options],
);
const tiles = visiblePinnedTags(sorted, anchorId);

useEffect(() => {
  if (options.length === 0) {
    setAnchorId((prev) => (prev === null ? prev : null));
    return;
  }
  const valueInOptions = Boolean(value && options.some((o) => o.value === value));
  const valueInTiles = Boolean(value && tiles.some((row) => row.id === value));
  const next =
    valueInOptions && !valueInTiles
      ? value
      : !anchorId || !options.some((o) => o.value === anchorId)
        ? valueInOptions
          ? value
          : options[0].value
        : anchorId;
  setAnchorId((prev) => (prev === next ? prev : next));
}, [optionKey, value, options, tiles, anchorId]);
```

4. Render a label, then a wrapping flex row of buttons (one per visible tag). Selected tag: `border-primary bg-primary/10 text-primary`. Unselected: `border-border-subtle bg-surface-bright text-text-primary`. `h-8 rounded-full px-3 text-small`, `truncate` / `max-w-[9rem]`.
5. If `options.length > 5`, render `SystemSelect` with `hideLabel`, `showAccent={false}`, same `value` / `onChange` / search props, and `renderTrigger` that draws a circular `+` (`h-8 w-8 rounded-full border ...` with `add` icon). Tag clicks call `onChange` only. `+` pick of a hidden id is handled by the effect in (3) after `onChange`.
6. Disabled/loading: tags and `+` use `disabled` / show “加载中…” in the row when `loading`.

- [ ] **Step 2: Typecheck**

Run: `cd codes/web && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Commit (only if the user asked)**

```bash
git add codes/web/src/components/PinnedTagSelect.tsx
git commit -m "$(cat <<'EOF'
feat: add PinnedTagSelect for favorite-first tag picking

EOF
)"
```

---

### Task 6: Wire the task drawer

**Files:**
- Modify: `codes/web/src/components/TaskDrawerWithComments.tsx`

**Interfaces:**
- Consumes: `PinnedTagSelect`, `WorkspaceOption`, `ProjectOption`
- Produces: drawer uses tag pickers; create/edit/project-page prefill unchanged at the form-state layer

- [ ] **Step 1: Replace the two `SystemSelect`s**

Remove the `SystemSelect` import if unused. Replace the `sm:grid-cols-2` block with a stacked `space-y-3` of two `PinnedTagSelect`s:

```tsx
<div className="space-y-3">
  <PinnedTagSelect
    label="工作空间"
    searchable
    searchPlaceholder="搜索工作空间…"
    options={workspaceOptions.map((w) => ({
      value: w.id,
      label: w.name,
      is_favorite: w.is_favorite,
      created_at: w.created_at,
    }))}
    value={selectedWorkspaceId || null}
    onChange={handleWorkspaceChange}
    loading={workspacesLoading}
    disabled={editLoading || itemLoading}
    emptyText="暂无可用工作空间"
  />
  <PinnedTagSelect
    label="所属项目"
    searchable
    searchPlaceholder="搜索所属项目…"
    options={projectOptions.map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.description?.trim() || undefined,
      is_favorite: p.is_favorite,
      created_at: p.created_at,
    }))}
    value={selectedProjectId || null}
    onChange={handleProjectChange}
    loading={projectsLoading}
    disabled={editLoading || itemLoading || !selectedWorkspaceId}
    emptyText={
      selectedWorkspaceId ? "该工作空间下暂无可选项目" : "请先选择工作空间"
    }
  />
</div>
```

Keep existing effects:

- Create without `workspaceId` still selects `workspaceOptions[0]` (now favorite-first from API).
- Project load still keeps `prev` if present, else `rows[0]`.
- Open/edit still copies `workspaceId` / `projectId` into selected state — that becomes `value`, and `PinnedTagSelect` re-anchors when that value is not in the default tiles.

Do not change save/move PATCH behavior.

- [ ] **Step 2: Typecheck**

Run: `cd codes/web && npx tsc --noEmit`

Expected: PASS

- [ ] **Step 3: Commit (only if the user asked)**

```bash
git add codes/web/src/components/TaskDrawerWithComments.tsx
git commit -m "$(cat <<'EOF'
feat: use tag chips for task drawer workspace and project

EOF
)"
```

---

### Task 7: Verify

- [ ] **Step 1: Automated checks**

```
cd codes/core-service && uv run pytest tests/test_project_sort.py tests/test_workspace.py -q
cd codes/core-service && uv run ruff check .
cd codes/web && npx tsc --noEmit
```

Expected: all pass

- [ ] **Step 2: Manual checklist from the spec**

1. Global/schedule create: first tiles favorite then newest; first selected
2. Project-page create: current workspace/project first and selected
3. Edit when current item is not in default top 5: that item first and selected
4. Click a non-first visible tag: selection moves, order stays
5. `+` pick a hidden option: becomes first and selected
6. `+` pick a visible option: selection only
7. Change workspace: project tiles rebuild to that workspace’s base sort
8. ≤ 5 options: no `+`
9. `+` search still filters the full list

---

## Spec coverage

| Spec rule | Task |
|-----------|------|
| List APIs return favorite + created_at; project favorite sort | 1, 2 |
| `visiblePinnedTags` / client sort | 3 |
| `+` reuses `SystemSelect` menu | 4, 5 |
| Tags + anchor vs selected | 5 |
| Drawer create/edit/project-page | 6 |
| Full-width stacked fields | 6 |
| Manual + typecheck | 7 |
| iOS / card favorites untouched | (no task) |
