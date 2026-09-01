# 训练记录与日程关联 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HealthKit 训练同步后核销已有日程任务或在选定项目补记一条已完成任务；「近期训练」标题右侧选择补记空间/项目，未选则创建「健康 / 训练记录」。

**Architecture:** 无 IO 纯函数在 `workout_schedule_match.py` 做族、关键词、打分、一对一分配、聚类与重复件。`workout_schedule.py` 读候选、ensure 落点、写 `health_workout_link` 与 `items`。`sync_workouts`、规划 `materialize_run`、删任务后调用 `reconcile_workout_schedule`。规划表不改。

**Tech Stack:** FastAPI / SQLAlchemy 2 / Alembic / pytest；Next.js；`make codegen` 同步 OpenAPI。

**Spec:** `docs/superpowers/specs/2026-08-31-workout-schedule-link-design.md`

## Global Constraints

- 用户可见文案一律简体中文。
- 规划模板与 `plan_slots` **不增加任何字段或开关**。
- `items` **不增加** `source_health_workout_id`；关联只在 `health_workout_link`。
- 核销 / 补记不调用 `log_activity`；ensure 创建「健康 / 训练记录」允许一次 `log_activity`。
- 健康明细不出个人域；非任务负责人看不到抽屉里的健康块。
- 第一期不做 iOS 待办/选择器/徽标。
- 不做 `codes/mobile/ios/Config/Debug.xcconfig` 提交。
- API 变更后仓库根目录 `make codegen`。
- core-service：`cd codes/core-service && PYTHONPATH=. uv run pytest …`；Ruff 行宽 100。

---

## File map

| File | Responsibility |
|------|----------------|
| `codes/core-service/app/services/workout_schedule_match.py` | 族、关键词、候选判定、分数、结局、贪心分配、聚类、重复件、补记标题 |
| `codes/core-service/tests/test_workout_schedule_match.py` | 上述纯函数 |
| `codes/core-service/app/models/health.py` | `HealthWorkoutLink`；`HealthProfile` 日程列 |
| `codes/core-service/app/migrations/versions/0031_workout_schedule_link.py` | 表与列 |
| `codes/core-service/app/services/workout_schedule.py` | ensure 落点、reconcile、核销、补记、待办动作 |
| `codes/core-service/tests/test_workout_schedule.py` | ensure、核销、补记、待办、删任务 HTTP/集成 |
| `codes/core-service/app/services/health_api.py` | `sync_workouts` / 训练软删后 reconcile；profile 新字段 |
| `codes/core-service/app/services/plan_apply.py` | `materialize_run` 后 reconcile |
| `codes/core-service/app/routes/items.py` | 删任务前处理 link |
| `codes/core-service/app/routes/health.py` | schedule-link / inbox resolve |
| `codes/core-service/app/schemas/health.py` | profile 与 link DTO |
| `codes/core-service/app/schemas/views/health.py` | inbox、schedule_link、落点 |
| `codes/core-service/app/services/views/my_health.py` | ensure + inbox_count + 落点 |
| `codes/core-service/app/services/views/workout_detail.py` | `schedule_link` |
| `codes/core-service/app/services/views/task_drawer.py` | `health_workout`（仅负责人） |
| `codes/core-service/app/services/views/schedule_items.py` | `health_linked` |
| `codes/web/src/components/health/HealthScheduleTargetPickers.tsx` | 标题行空间/项目芯片 |
| `codes/web/src/components/health/HealthScheduleInbox.tsx` | 待办三按钮 |
| `codes/web/src/components/health/HealthProfileForm.tsx` | 「训练与日程」设置 |
| `codes/web/src/components/health/MyHealthWorkouts.tsx` | 标题右侧选择器 |
| `codes/web/app/(app)/my/health/page.tsx` | 待办条 |
| 训练详情 / 任务抽屉 / `CalendarTaskCard` | 关联展示与改绑 |

---

### Task 1: 匹配纯函数（TDD）

**Files:**
- Create: `codes/core-service/app/services/workout_schedule_match.py`
- Test: `codes/core-service/tests/test_workout_schedule_match.py`

**Interfaces:**
- Produces:
  - `NARROW_FAMILY: dict[str, str]`（token → `run|walk|cycle|swim|strength|mind|exact`）
  - `activity_family(token: str) -> str`
  - `infer_item_family(title: str, body: str | None = None) -> str | None`（`None` / `wildcard` / 窄族名）
  - `is_schedule_candidate(*, item_project_id: uuid.UUID, target_project_id: uuid.UUID | None, inferred_family: str | None) -> bool`
  - `is_noise(*, activity_type: str, duration_seconds: int, min_duration_sec: int = 480, walk_min_duration_sec: int = 900) -> bool`
  - `local_day(moment: datetime, tz_name: str) -> date`
  - `score_pair(*, workout_start, workout_end, workout_type, item_start, item_end, item_family, item_status, tz_name) -> tuple[int, str]` 第二项为 `auto|inbox|none`（单对、忽略「当天候选条数」时 wildcard 走 inbox，条数由 `decide_outcome` 处理）
  - `decide_outcome(*, score: int, narrow_match: bool, wide_only: bool, is_wildcard: bool, overlap_ratio: float, same_day_candidate_count: int) -> str`
  - `assign_pairs(scored: list[tuple[uuid.UUID, uuid.UUID, int, str]]) -> list[tuple[uuid.UUID, uuid.UUID, str]]`（workout_id, item_id, outcome）；同一 workout/item 只用最高分那条；贪心
  - `cluster_workouts(rows: list[WorkoutSpan]) -> list[list[WorkoutSpan]]`
  - `collapse_duplicates(rows: list[WorkoutSpan]) -> tuple[list[WorkoutSpan], dict[uuid.UUID, list[uuid.UUID]]]`（主 id → 重复件 ids）
  - `primary_in_cluster(cluster: list[WorkoutSpan], min_duration_sec: int = 480, walk_min_duration_sec: int = 900) -> WorkoutSpan | None`
  - `materialize_title(*, activity_type: str, duration_seconds: int, distance_m: float | None) -> str`
  - `@dataclass WorkoutSpan`: `id, activity_type, start_at, end_at, duration_seconds, source_bundle_id, created_at`
  - `ACTIVITY_LABEL_ZH: dict[str, str]`（与 Web `workoutActivityStyle().label` 对齐：`running`→跑步，`strength`→力量训练，`functional_strength`→功能性力量，未知→其他训练）

- [ ] **Step 1: 写失败测试**

在 `codes/core-service/tests/test_workout_schedule_match.py`：

```python
from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.services.workout_schedule_match import (
    activity_family,
    assign_pairs,
    collapse_duplicates,
    cluster_workouts,
    decide_outcome,
    infer_item_family,
    is_noise,
    is_schedule_candidate,
    materialize_title,
    score_pair,
    WorkoutSpan,
)

TZ = "Asia/Shanghai"
SH = ZoneInfo(TZ)


def _at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 8, 31, hour, minute, tzinfo=SH)


def test_families_and_keywords():
    assert activity_family("running") == "run"
    assert activity_family("walking") == "walk"
    assert activity_family("strength") == "strength"
    assert activity_family("prep_recovery") == "mind"
    assert activity_family("cooldown") == "exact"
    assert infer_item_family("轻松跑步") == "run"
    assert infer_item_family("下肢力量") == "strength"
    assert infer_item_family("髋部康复") == "mind"
    assert infer_item_family("今日训练") == "wildcard"
    assert infer_item_family("开会") is None
    assert infer_item_family("跑步", "备注") == "run"


def test_candidate_project_and_title():
    target = uuid4()
    other = uuid4()
    assert is_schedule_candidate(
        item_project_id=target, target_project_id=target, inferred_family=None
    )
    assert is_schedule_candidate(
        item_project_id=other, target_project_id=target, inferred_family="run"
    )
    assert not is_schedule_candidate(
        item_project_id=other, target_project_id=target, inferred_family="wildcard"
    )
    assert not is_schedule_candidate(
        item_project_id=other, target_project_id=target, inferred_family=None
    )


def test_noise():
    assert is_noise(activity_type="walking", duration_seconds=420)
    assert is_noise(activity_type="cooldown", duration_seconds=600)
    assert not is_noise(activity_type="prep_recovery", duration_seconds=2400)
    assert not is_noise(activity_type="running", duration_seconds=1800)
    assert is_noise(activity_type="walking", duration_seconds=800)
    assert not is_noise(activity_type="walking", duration_seconds=1200)


def test_score_auto_vs_inbox():
    # 重叠 ≥50% + 窄族 → auto（50+30=80）
    score, _ = score_pair(
        workout_start=_at(19, 12),
        workout_end=_at(20, 1),
        workout_type="strength",
        item_start=_at(19, 0),
        item_end=_at(20, 0),
        item_family="strength",
        item_status="todo",
        tz_name=TZ,
    )
    assert decide_outcome(
        score=score,
        narrow_match=True,
        wide_only=False,
        is_wildcard=False,
        overlap_ratio=0.8,
        same_day_candidate_count=1,
    ) == "auto"
    # 开始差 2 小时、同日、窄族 → 15+30=45 inbox
    score2, _ = score_pair(
        workout_start=_at(12, 0),
        workout_end=_at(13, 0),
        workout_type="strength",
        item_start=_at(19, 0),
        item_end=_at(20, 0),
        item_family="strength",
        item_status="todo",
        tz_name=TZ,
    )
    assert decide_outcome(
        score=score2,
        narrow_match=True,
        wide_only=False,
        is_wildcard=False,
        overlap_ratio=0.0,
        same_day_candidate_count=1,
    ) == "inbox"
    # 步行 vs 跑步课表：宽族，不自动
    score3, _ = score_pair(
        workout_start=_at(19, 0),
        workout_end=_at(19, 40),
        workout_type="walking",
        item_start=_at(19, 0),
        item_end=_at(20, 0),
        item_family="run",
        item_status="todo",
        tz_name=TZ,
    )
    assert decide_outcome(
        score=score3,
        narrow_match=False,
        wide_only=True,
        is_wildcard=False,
        overlap_ratio=0.67,
        same_day_candidate_count=1,
    ) == "inbox"


def test_wildcard_one_vs_two():
    assert (
        decide_outcome(
            score=60,
            narrow_match=False,
            wide_only=False,
            is_wildcard=True,
            overlap_ratio=0.9,
            same_day_candidate_count=1,
        )
        == "auto"
    )
    assert (
        decide_outcome(
            score=60,
            narrow_match=False,
            wide_only=False,
            is_wildcard=True,
            overlap_ratio=0.9,
            same_day_candidate_count=2,
        )
        == "inbox"
    )


def test_assign_one_to_one():
    w1, w2, i1, i2 = uuid4(), uuid4(), uuid4(), uuid4()
    # 跑对跑 80，力对力 80，交叉 15
    out = assign_pairs(
        [
            (w1, i1, 80, "auto"),
            (w1, i2, 15, "none"),
            (w2, i2, 80, "auto"),
            (w2, i1, 15, "none"),
        ]
    )
    mapped = {(w, i): o for w, i, o in out}
    assert mapped[(w1, i1)] == "auto"
    assert mapped[(w2, i2)] == "auto"
    assert (w1, i2) not in mapped
    assert (w2, i1) not in mapped


def test_cluster_and_duplicates():
    a = uuid4()
    b = uuid4()
    c = uuid4()
    walk = WorkoutSpan(
        id=a,
        activity_type="walking",
        start_at=_at(7, 0),
        end_at=_at(7, 5),
        duration_seconds=300,
        source_bundle_id="com.apple.health",
        created_at=_at(7, 6),
    )
    run = WorkoutSpan(
        id=b,
        activity_type="running",
        start_at=_at(7, 5),
        end_at=_at(7, 45),
        duration_seconds=2400,
        source_bundle_id="com.apple.health",
        created_at=_at(7, 46),
    )
    cool = WorkoutSpan(
        id=c,
        activity_type="cooldown",
        start_at=_at(7, 45),
        end_at=_at(7, 50),
        duration_seconds=300,
        source_bundle_id="com.apple.health",
        created_at=_at(7, 51),
    )
    groups = cluster_workouts([walk, run, cool])
    assert len(groups) == 1
    from app.services.workout_schedule_match import primary_in_cluster

    assert primary_in_cluster(groups[0]).id == b
    later = WorkoutSpan(
        id=uuid4(),
        activity_type="running",
        start_at=_at(7, 5),
        end_at=_at(7, 45),
        duration_seconds=2400,
        source_bundle_id="com.strava",
        created_at=_at(8, 0),
    )
    primaries, dupes = collapse_duplicates([run, later])
    assert len(primaries) == 1
    assert primaries[0].id == b
    assert later.id in dupes[b]


def test_materialize_title():
    assert materialize_title(
        activity_type="running", duration_seconds=1920, distance_m=6200
    ) == "跑步 6.2 公里 · 32 分钟"
    assert materialize_title(
        activity_type="strength", duration_seconds=2940, distance_m=None
    ) == "力量训练 · 49 分钟"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_schedule_match.py -v`

Expected: FAIL，`ModuleNotFoundError` 或 import 失败。

- [ ] **Step 3: 实现 `workout_schedule_match.py`**

按 spec §4–§5、§6.2 标题规则实现。要点：

- 关键词表按 spec 4.2，**不要**用单字「跑/走」。先匹配表中靠上的族。
- `overlap = 交集秒数 / min(两边时长)`；`item_end` 为空当 `item_start + 60min`。全天：本地 00:00 起、结束为次日 00:00 或当日 24:00 → overlap=1。
- 分数：overlap≥0.5 → +50；否则 |start 差|≤90min → +35；否则同本地日 → +15；窄族同 +30；仅宽族（run×walk）+15；wildcard 且 overlap≥0.5 +10；status 已是 `done` +5。
- `decide_outcome`：① 窄族且 score≥70 → auto；② wildcard 且 overlap≥0.5 且 same_day_candidate_count==1 → auto；③ 40≤score 或 wide_only 或未走 ② 的 wildcard → inbox（score&lt;40 且非 wildcard 宽族则 none）；④ none。
- `assign_pairs`：按 score 降序，score 同则跳过已用 workout/item；只输出 outcome 为 auto 或 inbox 的对。
- `cluster_workouts`：按 start 排序，间隙 ≤30min 同组。
- `collapse_duplicates`：窄族相同、|start|≤5min、时长差/max≤10%；主记录优先 bundle 含 `com.apple.health` 或 `watch`，否则更长，否则 `created_at` 更早。
- `primary_in_cluster`：非 `is_noise` 中时长最长，并列取更早开始；全噪声返回 None。
- `materialize_title`：`distance_m >= 100` 才带公里一位小数。

- [ ] **Step 4: 测试通过**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_schedule_match.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/workout_schedule_match.py codes/core-service/tests/test_workout_schedule_match.py
git commit -m "$(cat <<'EOF'
Add workout-to-schedule matching helpers.

EOF
)"
```

---

### Task 2: 迁移与 ORM

**Files:**
- Create: `codes/core-service/app/migrations/versions/0031_workout_schedule_link.py`
- Modify: `codes/core-service/app/models/health.py`（`HealthProfile` 加列；新增 `HealthWorkoutLink`）
- Modify: `codes/core-service/app/models/__init__.py`、`codes/core-service/app/migrations/env.py`、`codes/core-service/app/routes/dev_db_tables.py` 注册模型

**Interfaces:**
- Produces: 表 `health_workout_link`；`health_profiles` 日程列；ORM `HealthWorkoutLink`
- Constants on the model module:
  - `LINK_ROLE_PRIMARY = "primary"`
  - `LINK_ROLE_SATELLITE = "satellite"`
  - `LINK_ROLE_DUPLICATE = "duplicate"`
  - `LINK_STATUS_PENDING = "pending"`
  - `LINK_STATUS_LINKED = "linked"`
  - `LINK_STATUS_SUPPRESSED = "suppressed"`
  - `LINK_STATUS_REJECTED = "rejected"`
  - `LINK_SOURCE_AUTO = "auto"`
  - `LINK_SOURCE_USER = "user"`

- [ ] **Step 1: 写迁移**

`revision = "0031_workout_schedule_link"`，`down_revision = "0030_workout_detail"`。

`health_profiles` 增加：

- `schedule_link_enabled` Boolean not null server_default true
- `schedule_link_enabled_at` DateTime(timezone=True) nullable
- `schedule_min_duration_sec` Integer not null server_default `480`
- `schedule_walk_min_duration_sec` Integer not null server_default `900`
- `schedule_move_to_actual` Boolean not null server_default true
- `schedule_workspace_id` UUID FK `workspaces.id` ON DELETE SET NULL nullable
- `schedule_project_id` UUID FK `projects.id` ON DELETE SET NULL nullable

`health_workout_link`：`id` UUID PK，`owner_user_id` FK users CASCADE，`workout_id` FK `health_workout_session.id` CASCADE，`item_id` FK `items.id` SET NULL，`role` VARCHAR(20)，`status` VARCHAR(20)，`source` VARCHAR(20)，`score` Float nullable，`planned_start_at` / `planned_end_at` timestamptz nullable，`created_at` / `updated_at`。

索引：

- `ix_health_workout_link_owner_status` (`owner_user_id`, `status`)
- `ix_health_workout_link_workout` (`workout_id`)
- `ix_health_workout_link_item` (`item_id`) 普通索引即可

部分唯一（PostgreSQL `postgresql_where`）：

```python
op.create_index(
    "uq_health_workout_link_primary",
    "health_workout_link",
    ["workout_id"],
    unique=True,
    postgresql_where=sa.text(
        "role = 'primary' AND status IN ('pending','linked','suppressed')"
    ),
)
op.create_index(
    "uq_health_workout_link_item_linked",
    "health_workout_link",
    ["item_id"],
    unique=True,
    postgresql_where=sa.text(
        "role = 'primary' AND status = 'linked' AND item_id IS NOT NULL"
    ),
)
op.create_index(
    "uq_health_workout_link_rejected_pair",
    "health_workout_link",
    ["workout_id", "item_id"],
    unique=True,
    postgresql_where=sa.text("status = 'rejected' AND item_id IS NOT NULL"),
)
```

downgrade：drop indexes / table / columns。

- [ ] **Step 2: ORM**

`HealthWorkoutLink` 对齐 `HealthWorkoutSession` 的 mixin。`HealthProfile` 增加同名 mapped columns，workspace/project FK `ondelete="SET NULL"`。

- [ ] **Step 3: 注册**

`models/__init__.py` 导出 `HealthWorkoutLink`；`env.py` import；`dev_db_tables.py` 的表列表加入 `("health_workout_link", HealthWorkoutLink)`。

- [ ] **Step 4: Commit**

```bash
git add codes/core-service/app/models/health.py codes/core-service/app/models/__init__.py codes/core-service/app/migrations/versions/0031_workout_schedule_link.py codes/core-service/app/migrations/env.py codes/core-service/app/routes/dev_db_tables.py
git commit -m "$(cat <<'EOF'
Add workout schedule link table and profile target columns.

EOF
)"
```

---

### Task 3: ensure 落点与 reconcile

**Files:**
- Create: `codes/core-service/app/services/workout_schedule.py`
- Test: `codes/core-service/tests/test_workout_schedule.py`
- Modify: `codes/core-service/app/schemas/health.py`（`HealthProfileIn`/`Out` 加日程字段，校验见下）
- Modify: `codes/core-service/app/services/health_api.py` 的 `get_profile` / `save_profile` 读写新字段；`invalid_schedule_project`；`schedule_link_enabled` 第一次变 true 且 `enabled_at` 空则打戳

**Interfaces:**
- Consumes: Task 1 纯函数；Task 2 ORM
- Produces:
  - `ensure_schedule_target(db, user) -> tuple[uuid.UUID, uuid.UUID] | None`（开关关闭返回 None；否则返回 workspace_id, project_id 并写 profile）
  - `reconcile_workout_schedule(db, user, window_start: datetime, window_end: datetime, tz_name: str) -> None`
  - `stamp_schedule_enabled_at(profile, now)` 内部
  - `DEFAULT_WORKSPACE_NAME = "健康"`
  - `DEFAULT_PROJECT_NAME = "训练记录"`
  - `apply_link_item(db, user, workout_id, item_id)` / `apply_materialize` / `apply_suppress` / `apply_unlink` / `resolve_inbox(db, user, link_id, action)` 可在本任务实现供 Task 5 路由调用

ensure（仅 `schedule_link_enabled` 为 true）：

1. profile 的 workspace+project 都有、项目属于该空间、未归档、用户对该项目有内容权限 → 返回
2. 否则：自己为 owner 且 name 恰好「健康」的空间取最早；没有则创建 Workspace + WorkspaceMember owner，`log_activity` action=`create`
3. 该空间未归档 name 恰好「训练记录」的项目取最早且有权限；没有则创建 Project + ProjectMember owner，`log_activity`
4. 写回 profile ids，flush，不 commit

reconcile：

1. 开关关：return
2. profile 无 enabled_at 且开关开：打戳 `now()`（不回填过去）
3. 窗口内未删除训练；collapse_duplicates + cluster；每组 primary
4. suppressed 的 primary 跳过
5. 已 linked 且同一 workout-item：按 spec §8 更新补记任务时间 / 课表跟随 `schedule_move_to_actual`；不新建
6. pending 且候选仍在、结局仍 inbox：保持
7. 候选：`assignee=user`、非 archived、`start_at` 非空，且 `is_schedule_candidate`
8. 否决对跳过；已 linked 的 item 不再接受新 primary
9. 打分 + `same_day_candidate_count` = 该训练本地日候选条数
10. auto → 核销（§6.1）；inbox → pending link；none 且非噪声且 `end_at >= enabled_at - 48h` → 补记（ensure 目标项目）；窗口外不补记仍可核销
11. primary 变为 linked 后写 satellite / duplicate，同一 `item_id`

核销 / 补记不 `log_activity`。补记 `body="来自健康训练"`，`color="#FFFFFF"`，`status=done`。

- [ ] **Step 1: 写失败测试**

`tests/test_workout_schedule.py` 用现有 `_register_and_login` 模式（可从 `test_health_api.py` 复制辅助函数）。至少：

1. `GET /views/me/health` 尚无落点时（Task 4 接上 ensure 后）——本任务先测 service：直接调 `ensure_schedule_target` 两次，第二次不新建第二条「健康」空间。需要 TestClient + 登录后从 DB 调，或写一个内部测试用 `Session`。**用 HTTP 更稳：本任务先测 `PATCH /health/profile` 非法项目 400 `invalid_schedule_project`，以及 ensure 通过一个临时测试路由？不要临时路由。** 用 pytest 里 `Session` fixture：看 `test_plan_api.py` / 现有 `conftest`。若只有 TestClient：先实现 `ensure` 后在本任务用 sync 路径测（依赖 Task 4）。  

**本任务测试改为：** 实现 service 后，用 TestClient：创建 workspace「工作」+ 项目，PATCH profile 把 `schedule_project_id` 指到不存在的 UUID → 400。合法空间项目 PATCH 200 读回。  

完整 ensure / 核销 / 补记放 **Task 4**（hooks 接上之后用 `POST /health/sync/workouts` 测）。本任务单测 `ensure_schedule_target`：在 `tests/test_workout_schedule.py` 用 FastAPI 的 `app` 依赖覆盖太重。采用：

```python
def test_ensure_creates_health_workspace_once():
    # 登录后 GET 尚未接 ensure。改为：
    # 直接 import Session from app.db — 若测试库是 TestClient 共用 SQLite/Postgres：
```

仓库现有 HTTP 测试走真实 DB。做法：Task 3 实现 `ensure_schedule_target`；测试通过 **临时调用**：在 `health_api.save_profile` 之后不调用 ensure。单独测试文件 import `get_db` 不行。

**采用与 `test_health_api.py` 相同 HTTP，本任务只覆盖 profile PATCH。ensure/reconcile 的 HTTP 测放 Task 4。** 另写纯函数已在 Task 1。本任务加：

```python
def test_profile_rejects_bad_schedule_project():
    ...
    resp = client.patch("/health/profile", headers=_headers(token), json={
        "schedule_workspace_id": str(uuid.uuid4()),
        "schedule_project_id": str(uuid.uuid4()),
    })
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_schedule_project"
```

`HealthProfileIn` 增加可选 UUID 字段；`schedule_min_duration_sec` ge=1 le=7200 等同。

- [ ] **Step 2: 跑测失败**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_schedule.py::test_profile_rejects_bad_schedule_project -v`

Expected: FAIL（字段尚未被接受或 detail 不对）

- [ ] **Step 3: 实现 profile 校验 + `workout_schedule.py` 骨架（ensure + reconcile 完整逻辑）**

`save_profile`：若 set 了 workspace/project，必须成对、项目 `workspace_id` 匹配、`require_project_content_access`，否则 400 `invalid_schedule_project`。`schedule_link_enabled` 从非 true 到 true 且 `enabled_at` 空 → `enabled_at=utcnow()`。

`ensure_schedule_target` / `reconcile_workout_schedule` 按上面 Interfaces 写完（Task 4 只负责接线）。创建空间/项目时 **不要** `db.commit()`，由调用方 commit。复制 `routes/workspaces.py` / `routes/projects.py` 的 insert + member + log_activity，抽本地函数 `_create_owned_workspace` / `_create_owned_project`。

权限用 `app.services.permissions.require_project_content_access`。找不到用户时不要 404 泄露健康存在性。

- [ ] **Step 4: profile 测试通过**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_schedule.py::test_profile_rejects_bad_schedule_project -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/workout_schedule.py codes/core-service/app/schemas/health.py codes/core-service/app/services/health_api.py codes/core-service/tests/test_workout_schedule.py
git commit -m "$(cat <<'EOF'
Add schedule target profile fields and reconcile service.

EOF
)"
```

---

### Task 4: 接到同步、规划导入、删任务

**Files:**
- Modify: `codes/core-service/app/services/health_api.py` — `sync_workouts` flush 后按本批 min(start)-3h … max(end)+3h 调 `reconcile_workout_schedule`；训练软删（`sync_deletions` 里 workout）后：补记任务（无 `source_plan_*`）→ `archived`；课表任务只删该 workout 的 link，不把 done 改回 todo
- Modify: `codes/core-service/app/services/plan_apply.py` — `materialize_run` 创建任务后，用本批 item 的 min/max 时间 ±3h 调 reconcile；timezone 用 apply 的 timezone
- Modify: `codes/core-service/app/routes/items.py` `delete_item`：在 `db.delete(i)` **之前** 查 `HealthWorkoutLink` 该 `item_id`。若 primary linked 且 item 无 `source_plan_*` → 该 workout 的 primary 改为 `suppressed`、`item_id=None`；若有 `source_plan_*` → 删除这些 link 行。然后照常删除任务。
- Modify: `codes/core-service/app/routes/views/health.py` `my_health`：`build_my_health` 前若开关开则 `ensure_schedule_target`，然后 `db.commit()`（仅当 ensure 可能写库；可比较 profile ids 是否变化。简单做法：ensure 总是 flush，路由总是 commit——与现有 GET 只读略有不同，spec 允许）
- Modify: `codes/core-service/app/services/views/my_health.py` 返回 `schedule_inbox_count`、`schedule_workspace_id`、`schedule_project_id`、`schedule_workspace_name`、`schedule_project_name`（先加 schema 字段，count 本任务可先 0，Task 6 填真实 inbox）—— **本任务就把 schema 字段加上并在 GET 里 ensure，count 用 pending 查询。**
- Test: 扩展 `tests/test_workout_schedule.py`

**Interfaces:**
- Consumes: `reconcile_workout_schedule`, `ensure_schedule_target`
- 辅助：先 `POST /workspaces` 建空间、`POST /workspaces/{id}/projects` 建项目、再 `POST /plan-templates` + slots + subscribe，或手建 `POST /workspaces/{id}/projects/{id}/items` 一条「力量」19:00–20:00。看现有 `test_plan_api.py` / `test_health_api.py` 的 item/workout payload。

- [ ] **Step 1: 写失败测试**

```python
def test_sync_workout_fulfills_same_project_strength_item():
    # 1. 登录；创建空间+项目；PATCH profile 指向它
    # 2. POST item title=力量 start/end 当天 19:00–20:00 assignee=自己
    # 3. POST /health/sync/workouts 一条 strength 19:12–20:01
    # 4. GET item → status done，且只有这一条（不要第二条补记）
    # 5. 再 sync 同一 hk_uuid → item 数仍为 1

def test_unmatched_run_materializes_into_health_project():
    # 不 PATCH 落点；POST workout running 32min 6.2km
    # GET /views/me/health → schedule_workspace_name == 健康, project 训练记录
    # 日程：GET 我的日程或 list items → 一条 done「跑步 6.2 公里 · 32 分钟」
    # 再 GET /views/me/health 不出现第二个「健康」空间（list workspaces name=健康 只有 1）

def test_running_title_in_wrong_project_still_links():
    # 工作空间项目里手建「跑步」；补记目标是另一项目
    # sync running 重叠时间 → 核销手建任务，补记目标项目不再多一条

def test_delete_materialized_item_suppresses():
    # 补记后 DELETE item；再 sync 同一 hk_uuid 不重建
```

查创建 item 的真实路径：`POST /workspaces/{workspace_id}/projects/{project_id}/items`（见 `codes/core-service/app/routes/items.py`）。查询「我的」任务：`GET /views/me/schedule/calendar` 或已有 items list。用 `GET /workspaces/{id}/projects/{id}/items` 若存在则用它。

- [ ] **Step 2: 跑测失败**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_schedule.py -v`

Expected: 新用例 FAIL（尚未接线）

- [ ] **Step 3: 接线**

`sync_workouts` 末尾（flush 与 daily metrics 之后）：

```python
if payload.workouts:
    starts = [_aware(w.start_at) for w in payload.workouts]
    ends = [_aware(w.end_at) for w in payload.workouts]
    from datetime import timedelta
    reconcile_workout_schedule(
        db, user,
        window_start=min(starts) - timedelta(hours=3),
        window_end=max(ends) + timedelta(hours=3),
        tz_name=tz_name,
    )
```

`materialize_run` 在 `db.add` 完 items 后同样用创建出的 start/end。

`my_health` 路由：ensure + commit。

- [ ] **Step 4: 测试通过**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_schedule.py tests/test_health_api.py tests/test_plan_api.py -v --tb=short`

Expected: PASS（plan 测试不应被 materialize 后的 reconcile 破坏：无训练则 reconcile 空转）

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/health_api.py codes/core-service/app/services/plan_apply.py codes/core-service/app/routes/items.py codes/core-service/app/routes/views/health.py codes/core-service/app/services/views/my_health.py codes/core-service/app/schemas/views/health.py codes/core-service/tests/test_workout_schedule.py
git commit -m "$(cat <<'EOF'
Reconcile workouts with calendar items on sync and plan import.

EOF
)"
```

---

### Task 5: 写入 API（改绑 / 待办）

**Files:**
- Modify: `codes/core-service/app/schemas/health.py` 增加：

```python
class HealthScheduleLinkIn(BaseModel):
    action: Literal["link_item", "materialize", "suppress", "unlink"]
    item_id: UUID | None = None

class HealthScheduleInboxResolveIn(BaseModel):
    action: Literal["confirm", "materialize", "suppress"]

class HealthScheduleLinkOut(BaseModel):
    workout_id: str
    item_id: str | None = None
    status: str
    role: str
    source: str
```

- Modify: `codes/core-service/app/routes/health.py`
  - `POST /health/workouts/{workout_id}/schedule-link`
  - `POST /health/schedule-inbox/{link_id}/resolve`
- Modify: `codes/core-service/app/routes/views/health.py`
  - `GET /views/me/health/schedule-inbox`
- Create schema `HealthScheduleInboxItemOut`：训练摘要 + 候选任务 id/title/start/end
- Test: `tests/test_workout_schedule.py` 增加 confirm / materialize / suppress / 非主人 404 / 手动 link 非候选任务（自己负责即可）

**Interfaces:**
- `link_item`：item 必须 `assignee_user_id == user.id`；核销逻辑与 auto 相同，`source=user`；可绑非候选。
- `materialize`：ensure 后补记（即使有课表候选，用户明确当额外训练时先写 rejected 再补记——inbox 的 materialize）。
- `suppress`：primary status=suppressed，item_id 空。
- `unlink`：课表任务保持 done，删/改 link；补记任务 archived。
- 找不到 workout 或 link：404 `not_found`（与其它 health 一致）。

- [ ] **Step 1: 写失败测试**（inbox：中午力量 vs 晚上课表力量 → GET inbox 一条；confirm 后 item done 且 inbox 空；另一用户 token GET 404）

- [ ] **Step 2: 跑测失败**

- [ ] **Step 3: 实现路由，薄封装 `workout_schedule.py` 函数，路由 `db.commit()`**

- [ ] **Step 4: 测试通过**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add workout schedule link and inbox resolve APIs.

EOF
)"
```

---

### Task 6: 视图字段与 codegen

**Files:**
- Modify: `HealthWorkoutDetailOut` 增加可空 `schedule_link: HealthWorkoutScheduleLinkOut | None`（item_id, item_title, role, status, source）
- Modify: `codes/core-service/app/services/views/workout_detail.py` 填充
- Modify: `ItemDetailViewOut` 增加 `health_workout: HealthItemWorkoutOut | None`（workout_id, activity_type, duration_seconds, distance_m）；仅当 `assignee_user_id == current_user.id` 且存在 primary linked
- Modify: `ScheduleTaskItemOut` 增加 `health_linked: bool = False`；`list_schedule_items` 对当前用户 assignee 的 item 批量查 linked primary
- Modify: `MyHealthViewOut`：`schedule_inbox_count: int = 0`；落点 id+name（Task 4 若已加则补全）
- `codes/web/src/types/api/views/health.ts` 同步手写 views 类型（与现有 `MyHealthView` 一样不要只靠 generated）
- 仓库根目录 `make codegen`

- [ ] **Step 1: 测试** `GET /views/me/health/workouts/{id}` 核销后带 `schedule_link.item_title`；另一用户 404。抽屉：负责人有 `health_workout`，把任务 assignee 改成别人后再 GET 抽屉（若 API 允许）无该块——若不好改 assignee，用第二用户拉第一用户任务详情 404 或无 health 块。日程 calendar item `health_linked true`。

- [ ] **Step 2: 实现视图**

- [ ] **Step 3: `make codegen`**

Run: 仓库根目录 `make codegen`

Expected: `openapi.json` 与 `codes/web/src/types/api/generated.ts` 更新。

- [ ] **Step 4: Commit**（含 codegen 产物与 views 手写类型）

```bash
git commit -m "$(cat <<'EOF'
Expose workout-schedule links on health and calendar views.

EOF
)"
```

---

### Task 7: Web 落点选择、待办、设置

**Files:**
- Create: `codes/web/src/components/health/HealthScheduleTargetPickers.tsx`
- Create: `codes/web/src/components/health/HealthScheduleInbox.tsx`
- Modify: `codes/web/src/components/health/MyHealthWorkouts.tsx` 标题行 `flex flex-wrap items-center justify-between gap-md`；右侧两个紧凑 `PinnedTagSelect`（或抽芯片：label 可 `sr-only`，触发器显示当前名称）。数据源对齐 `PlanTargetPickers`（`fetchWorkspaceCards` / `fetchMyProjects` / WorkspaceModal / ProjectModal）。变更 `patchHealthProfile`。
- Modify: `codes/web/app/(app)/my/health/page.tsx`：`HealthScheduleInbox` 放在卡片之前；把 `view.schedule_*` 与 `token` 传给 `MyHealthWorkouts`。
- Modify: `codes/web/src/hooks/useMyHealthPage.ts`：保存 profile 含日程字段；刷新 inbox。
- Modify: `codes/web/src/lib/api/health-views.ts`：`fetchScheduleInbox`、`resolveScheduleInbox`、`patchHealthProfile` 已有则扩 payload。
- Modify: `codes/web/src/components/health/HealthProfileForm.tsx`：基础信息表单**下方**分区「训练与日程」：总开关、最短时长（分钟输入，提交时 ×60）、步行最短、核销后改时间。不要空间/项目。文案简体中文。
- Modify: `codes/web/src/types/api/views/health.ts` 与 page props。

**交互：** `md` 以下选择器折行右对齐。未加载完不闪空：`view` 带回的 ensure 名称作为初始 value。

- [ ] **Step 1: 实现组件并接到页面**（Web 无单测则手动对照 spec §10）

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add health schedule target pickers and inbox on the web.

EOF
)"
```

---

### Task 8: 训练详情改绑、抽屉入口、日程徽标

**Files:**
- 训练详情页组件（`codes/web/app/(app)/my/health/workouts/[id]/page.tsx` 或现有 `WorkoutDetail*`）：一行「已记入日程 · {title}」可取消（`unlink`）；「未记入日程」按钮「记入日程」→ 补记 `materialize`，或列出时间接近候选（用 inbox 或详情里的 link pending）；可搜索自己的任务再 `link_item`。搜索用现有日程/items 搜索若无则先只做 complement：按钮「记入所选项目」走 materialize。**最小满足 spec：** 显示关联、取消、一键补记；候选列表用 `GET /views/me/health/schedule-inbox` 过滤该 workout_id。手动搜任务：若现有 `GET /views/me/schedule/calendar` 过重，加可选 query 不做——spec 允许训练详情列出候选。实现：inbox 项 + 「记入日程（新建）」materialize。
- Modify: `codes/web/src/components/TaskDrawerWithComments.tsx`（或详情展示处）：负责人且 `health_workout` 非空时一行链接 `/my/health/workouts/{id}`，文案「健康训练」。
- Modify: `codes/web/src/components/schedule/CalendarTaskCardLines.tsx`：`item.health_linked && (done|archived)` 时标题旁 `text-[9px] text-primary`「健康」。不改删除线规则。
- Modify: `codes/web/src/types/api/views/schedule.ts` `health_linked?: boolean`

- [ ] **Step 1: 实现并在 Web 健康页、详情、日程日视图点开已关联任务核对**

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
Show workout-schedule links in detail, task drawer, and calendar.

EOF
)"
```

---

## Spec coverage

| Spec | Task |
|------|------|
| §3 候选 / 错放项目 / 多课表 | 1, 4 |
| §4 打分一对一 | 1 |
| §5 聚类重复件噪声 | 1, 3 |
| §6.1–6.2 核销补记 | 3, 4 |
| §6.3 ensure 健康/训练记录 | 3, 4, 7 |
| §6.4 回灌窗口 | 3 |
| §7 表与 profile | 2, 3 |
| §7.3 规划不改 | 全程不碰 plan 模型 |
| §8 触发幂等 | 4 |
| §9 API | 5, 6 |
| §10 Web | 7, 8 |
| §11 场景 10b/26b 等 | 4 测试 |
| iOS | 不做 |

## Placeholder scan

无 TBD。Task 4 创建 item 的 URL 以实现时 `routes/items.py` 的装饰器为准（`POST /workspaces/{workspace_id}/projects/{project_id}/items`）。
