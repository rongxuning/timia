# Timia Web — 日历任务拖拽改期方案

> 方案日期：2026-08-11
> 状态：已确认，进入实现
> 适用范围：timia-web 日历（日/周/月）
> 数据模型：`ScheduleTaskItem.start_at` / `end_at`（ISO 8601，本地时区渲染）
> 后端：`PATCH /workspaces/{ws}/projects/{pj}/items/{id}` 接受 `start_at` 与 `end_at` 独立字段（`ItemUpdate`），版本号乐观锁

## 1. 现状摘要（先把"会改哪些文件"亮出来）

### 已有拖拽能力
- `PriorityQuadrants`（改 `priority`）和 `SwimlaneKanban`（改 `status`）都走原生 HTML5 `draggable` + `onDragStart/onDragOver/onDrop`。
- 状态在 `ScheduleBoard.tsx` 集中：`dragItemId` + `dragOverPriority` + `dragOverStatus`，子组件通过 props 接收/回写。
- `dataTransfer.setData("text/task-id", it.id)` 跨区域传递任务 id，drop handler 调用 `apiFetch(PATCH)` + `reloadAll()`。

### 日历里目前没有拖拽
- `ScheduleCalendar` 是纯展示 + 点击交互（点空白处新建、点头部跳日视图）。
- 三个视图组件（`ScheduleCalendarMonth/Week/Day`）都没有 `draggable` 也没有 `onDrop`。
- 任务渲染位置：
  - 月：`CalendarTaskBar`（绝对定位在 7 列 grid 上，按 `col_start/col_span/lane` 摆放）。
  - 周/日：分两段——`CalendarAllDayRow`（整天任务）和 `CalendarTimelineColumn`（24 个小时格 + 任务块）。

### 关键类型
- `ScheduleTaskItem.start_at` / `end_at` 都是可选 ISO 字符串。
- `ScheduleCalendarBodyProps` 已经是统一入口，新增拖拽 props 时顺着这个 type 加字段最省事。

## 2. 功能目标（一句话）

在日历的日/周/月三个视图里都能拖动任务来调整它的 `start_at`，保持 `end_at - start_at` 的时长不变（"结束时间顺延"）。

## 3. 各视图交互

| 视图 | 落点 | 行为 |
|------|------|------|
| 月 | 日期格（7 列 × N 行） | 仅改**日期**，保留原 `start_at` 的时分秒；`end_at` = `start_at + 原 duration` |
| 周 | 全天行（7 列） | 同上，仅改日期，保留时分 |
| 周 | 时间段格（24 小时槽 × 7 列） | 改日期**和**时间——`start_at` 落到该小时整点，`end_at` = `start_at + 原 duration` |
| 日 | 时间段格（24 小时槽） | 改**时间**——`start_at` 落到该小时整点，`end_at` = `start_at + 原 duration` |

为什么月只能改日期：月视图本来就没有"小时"这个维度，按整点 snap 不合理，所以只搬日期。

## 4. 完整规则

### 4.1 可拖动范围
- ✅ 状态 = `todo` / `doing` / `done`（与现有 `PriorityQuadrants` 一致）
- ❌ 状态 = `archived`（已归档不能改期）
- ❌ 跨工作区/项目只读权限（前端隐藏 draggable，后端 403 由 `setError` 兜底）

### 4.2 时长计算（核心）

按"任务在日历里实际呈现的状态"分三类（实际可拖动时按各自规则处理）：

| 任务状态 | 判定 | 拖到日期格 / 全天行 | 拖到小时槽 |
|---------|------|--------------------|------------|
| **定时任务** | 有 `start_at` 且 `end_at` 未覆盖整天 | 改日期，**保留原时分** | 改日期 + snap 到小时整点，**保留原 duration** |
| **全天任务**（calendar all-day） | `start_at = 00:00` 且 `end_at ≥ 23:59` 当日；或仅有 `start_at = 00:00` | 改日期，**保持整天**（仍是 00:00–23:59 或单点 00:00） | **不允许**（per Q4） |
| **无 start_at 待办** | `start_at == null` | 设 `start_at = 09:00` / `end_at = 10:00`（per Q2） | 设 `start_at = 该小时整点` / `end_at = +1h`（per Q2） |

注：第 3 种在日历里实际上不会出现（`build_calendar_view._local_day_range_from_item` 对无 start_at 返回 None，不进日历）。该规则只用于防御性兜底（比如未来从优先级视图拖到日历）。

**时长保留**：定时任务拖动时 `duration = end_at - start_at`，新 `end_at = 新 start_at + duration`，跨日也成立。

### 4.3 跨日任务
- 比如 Mon 09:00 – Wed 18:00 拖到月视图的 15 号：起 → 15 号 09:00，止 → 15 号 + (Wed-Mon 的天数差 + 原时间段) = 17 号 18:00
- 跨日块在月视图里跨多列，搬到新位置后由后端 `build_calendar_view` 重新计算 `col_start/col_span/lane`，前端不需要重算 layout，拖完 `reloadAll` 即可

### 4.4 重复任务（**决定：Q1 = A**）
- 拖的是单次发生：PATCH 被拖那一条 occurrence 的 `start_at` / `end_at`，不影响 master 和其它 occurrence
- 后端 `materialize_repeat_occurrences` 只在 `payload.repeat ∈ fields_set` 时才重新生成，所以 PATCH 不带 `repeat` 字段不会触发重生成 → 行为天然就是"只动一条"
- 已知代价：series 整体不再同步；如果用户之后改了 master 的 `repeat` 字段，旧的 occurrence 不会被清理。这是用户接受的成本。

### 4.5 落点边界（**决定：Q3 = 允许**）
- 月视图的"非本月"日期格（`in_month=false`）：**允许**拖入（它就是真实的一天），hover 时整格降透明度（`opacity-60`）做视觉提示
- 周/日视图：24 个小时槽 0-23 全部支持拖入（仅限定时任务）；**始终保留原 duration**，不截断到 23:59（截断会把跨日任务错误变成单日任务，后端 `build_calendar_view` 已能正确处理跨日展示）
- 拖到**同位置**（start_at / date 不变）：不发 PATCH，直接重置 drag 状态（`isSameDateTimeRange` 按 ms 时间戳比较）

### 4.6 视觉反馈
- 可拖任务：鼠标 hover 时 `cursor: grab`，按下 `cursor: grabbing`
- dragover 落点：月/周日期格背景色 tint（`bg-primary/10`），周/日小时槽边框高亮
- 拖动中其它行降低透明度（0.5）突出 hover 目标
- PATCH 进行中：该任务卡加 `opacity-70` + 隐藏勾选按钮（避免重复点击）
- 失败：`setError` 顶部红条提示（沿用现有 `ScheduleBoard` 错误展示）

### 4.7 触摸端
- HTML5 drag/drop 不支持触屏，触屏/手机 web 当前拖不动。后续如果需要做 pointer events 那套再说（不在本次范围）。

## 5. 实现方案

### 5.1 状态层
集中在 `ScheduleBoard.tsx`，新增：
```ts
const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
const [dragOverHour, setDragOverHour] = useState<number | null>(null);

async function updateTaskDateTime(itemId: string, newStart: Date, newEnd: Date | null) {
  // 找到当前 item → PATCH { version, start_at, end_at } → reloadAll
  // 错误走 setError
}
```
`ScheduleCalendar` 接收 `onTaskDateTimeDrop`、各视图组件接收 `dragOverDateKey` / `dragOverHour` / `onDragItemIdChange` / `onDropDateTime` 等 props（与现有 priority 拖拽同模式）。

### 5.2 关键工具函数（新增到 `taskUtils.ts`）
```ts
/**
 * 给定原任务 + 目标落点，计算新的 start_at / end_at
 * - 保持原 duration（end_at - start_at）
 * - 保持原时区信息（用 toISOString() 直接发后端）
 */
export function computeRescheduledRange(
  item: ScheduleTaskItem,
  dropDateKey: string,   // YYYY-MM-DD
  dropHour: number | null,  // null = 保留原时分
): { startAt: string; endAt: string | null }
```
同时给月/周/周/日的落点用：`localDatetimeRangeFromDateKey` 已经存在但只用于"新建"，不能直接复用，因为我们要保留原 duration。

### 5.3 组件改动清单

| 文件 | 改动 |
|------|------|
| `taskUtils.ts` | 新增 `computeRescheduledRange` |
| `ScheduleCalendar.types.ts` | `ScheduleCalendarBodyProps` 加 `draggableItemId?: string \| null`、`onDragItemIdChange?`、`onDropDateTime?`、`dragOverDateKey?`、`dragOverHour?` |
| `ScheduleBoard.tsx` | 加 `updateTaskDateTime` 处理器 + 落点状态 + 把 props 透传给 `ScheduleCalendar` |
| `ScheduleCalendar.tsx` | 透传新 props |
| `ScheduleCalendarMonth.tsx` | 给每个 `CalendarTaskBar` 加 `draggable`+`onDragStart/End`；每个日期格 + 该格对应的空白列区加 `onDragOver/onDrop` |
| `ScheduleCalendarWeek.tsx` | 同月视图；额外：24 小时槽 `onDragOver/onDrop` |
| `ScheduleCalendarDay.tsx` | 24 小时槽 `onDragOver/onDrop` |
| `CalendarTaskBar.tsx` | 加可选 `draggable` / `onDragStart` / `onDragEnd` props（默认 false 不影响其它用法） |
| `CalendarAllDayRow.tsx` | 加 `onDropDateTime` 处理（如果全天行是落点） |
| `CalendarTimelineColumn.tsx` | 给 24 个小时槽按钮加 `onDragOver`/`onDrop`/`onDragLeave`（已有 `onDateBlankClick` 顺势扩展） |
| `CalendarDateBlankColumns.tsx` | 加 `onDropDateTime` 处理（月视图里空白点击 + 拖拽落点统一） |

### 5.4 拖拽识别
- 不在 props 显式传 `draggable`，组件内自己判断：`item.status !== "archived"` 时设 `draggable={true}`
- 与现有 `PriorityQuadrants` 模式一致（用 `dragItemId` 全局 state 做协同，避免不同区域拖拽互相打架）

### 5.5 失败/重入保护
- `updateTaskDateTime` 用 `completingItemId` 同款的 `movingItemId` state 防重入：拖完一个任务还没回来时，新拖拽的 drop 直接忽略并提示"上次改期未完成"
- 版本冲突（409）→ `setError("任务已被他人修改，请刷新")` 沿用现有 `version_conflict` 文案

## 6. 最终决定（碓冰 2026-08-11 拍板）

| 编号 | 问题 | 决定 |
|------|------|------|
| Q1 | 重复任务拖拽语义 | **A：只动被拖那一条 occurrence** |
| Q2 | 无 start_at 任务被拖到月视图日期格 | 落到 **09:00–10:00**（与"点击空白新建"默认时段一致） |
| Q3 | 月视图"非本月"日期格能否拖入 | **允许**（hover 时降透明度作提示） |
| Q4 | 全天任务能否拖到小时槽 | **不支持**；保持整天，仅能改日期 |

## 7. 不在本次范围
- iOS 端（用户已说明"先仅在 web 端开发"）
- 触屏 / pointer events
- 跨工作区/项目的拖拽（只动时间，不动归属）
- 拖拽过程中实时 ghost 预览的自定义（用浏览器默认 drag image）
- 全天行 ↔ 时间段格之间的相互拖拽转换（如果 Q4 选了"保持整天"则不需要；如果选了"转定时"则需要做，单独提一次确认）

## 8. 验证计划
1. 单测/手测脚本覆盖 `computeRescheduledRange` 各种边界：跨日、无 start_at、无 end_at、整点 vs 半点、跨月跨年
2. 浏览器手测：新建一个 1h 任务，分别在月/周/日拖到不同位置，检查 start_at/end_at 与 PATCH 入参一致
3. 409 冲突：另开一个 tab 改同一任务，本 tab 拖动后看错误条
4. 已归档任务：拖不动（鼠标不显示 grab）
5. 重复任务（如果选 C）：拖拽不响应
