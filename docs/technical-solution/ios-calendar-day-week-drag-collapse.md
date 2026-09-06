# Timia iOS — 日/周模式任务拖拽与空闲时段折叠方案

> 方案日期：2026-09-06  
> 状态：**已确认**（2026-09-06 拍板；实现计划见 `docs/superpowers/plans/2026-09-06-ios-calendar-drag-collapse.md`）  

> 适用范围：iOS `ScheduleHomeView` 日历内容下的 **日模式 / 周模式** 时间轴  
> 对齐参考：`docs/technical-solution/web-calendar-item-drag.md`  
> 数据模型：`ScheduleTask.startAt` / `endAt`（ISO 8601）  
> 后端：`PATCH /workspaces/{ws}/projects/{pj}/items/{id}`（`ItemUpdatePayload`，含 `version` 乐观锁）

---

## 1. 现状摘要

| 能力 | 现状 |
|------|------|
| 日/周时间轴 | `DayScheduleView` / `WeekScheduleView` → 共用 `TimelineGrid`（`ScheduleHomeView.swift`） |
| 布局 | 固定 `hourHeight = 74`，始终渲染 **0–24h**；任务按 `startMinutes` 绝对 `offset` 放置；重叠走 `TimelineOverlapLayout` |
| 改期入口 | 点击任务 → `TaskEditorView` 改时间；**无拖拽改期** |
| 空白交互 | `SpatialTapGesture` 点空白 → 15 分钟 snap 新建 |
| 空闲折叠 | **无**；稀疏日程仍占满约 `24 × 74` 高度 |
| 手势冲突面 | 外层 `LazyVStack` 无限日/周分页纵向滚动；任务本身是 `Button` |

结论：拖拽与折叠都是 **TimelineGrid 坐标体系上的增强**；不改后端日历视图 API，复用现有 PATCH。

---

## 2. 目标与非目标

### 2.1 目标

1. **日模式、周模式**下，可拖动定时任务块改期（改 `startAt`，**保持时长**，`endAt = startAt + duration`）。
2. 当时间轴上存在**大段无任务空闲**时，支持**折叠空闲段**，优先展示有任务的时间带；提供**折叠 / 展开入口**。
3. 折叠态下点击空白新建、当前时间线、拖拽落点，仍能映射到正确真实时间。

### 2.2 非目标（本方案不做）

- 月 / 年视图拖拽或折叠  
- 拖拽改变任务时长（上下边 resize）——可后续单独立项  
- 全天行 ↔ 定时格相互转换（全天仅允许改日期时另述）  
- 跨工作区 / 项目拖拽（只改时间，不改归属）  
- Web 端空闲折叠（若要对齐，另开方案）  
- 改造遗留 `ScheduleView.swift`（未挂导航，不投入）

---

## 3. 已确认假设（2026-09-06 拍板）

| ID | 假设 | 状态 |
|----|------|------|
| A1 | 拖拽语义与 Web 对齐：保时长、只动单条 occurrence、`archived` 不可拖 | ✅ |
| A2 | 定时任务可拖；全天任务 **本期不做**；**不做**拖拽改时长（resize） | ✅ 确认不纳入本期 |
| A3 | 拖拽落点 snap **整点（60 分钟）**，与 Web 对齐；点空白新建仍可保持现有 15 分钟 | ✅ 对齐 Web |
| A4 | 触发：长按约 **0.35s** 进入拖拽，避免与纵向滚动、单击进编辑冲突 | ✅ |
| A5 | 折叠对象：连续空闲 **≥ 2 小时**；有任务覆盖的小时永不折叠 | ✅ 合适 |
| A6 | 默认：进入日/周日历时若存在可折叠空闲则 **自动折叠**；用户可一键展开全部 / 再折叠 | ✅ 是 |
| A7 | 折叠偏好：记住「是否启用空闲折叠」到 `UserDefaults`；单段临时展开不持久 | ✅ |
| A8 | 本日若含「当前时刻」，折叠时仍保留当前小时所在 **可见段**（或保证当前时间线可见） | ✅ |
| A9 | 周模式：**七天 busy 并集** 后算空闲并折叠，折叠条跨列对齐（W1） | ✅ 并集对齐 |
| A10 | 命中折叠条时自动临时展开该段，再精确落点 | ✅ |

---

## 4. 方案对比与推荐

### 4.1 空闲折叠：三种做法

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| **C1 压缩条 + 坐标映射（推荐）** | 仍按真实分钟布局，但空闲段用矮折叠条替换；`minutes ↔ y` 经 `TimelineGeometry` 映射 | 与现有绝对定位兼容；拖拽/新建/当前线共用一套几何 | 需抽出几何层，改动面集中 |
| **C2 变高小时行** | 空闲小时 `hourHeight` 变小（如 12pt），有任务小时保持 74 | 实现直观 | 24 行仍在；大空闲节省有限；跨小时任务高度计算易错 |
| **C3 只渲染有任务窗口** | 裁成若干「忙碌窗口」拼接，中间跳转 | 最省空间 | 丢失日结构；跨窗口拖拽与新建体验差 |

**推荐 C1。** 与现有 `offset(y:)` 模型契合，且是拖拽正确落点的前提。

### 4.2 拖拽手势：三种做法

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| **D1 SwiftUI 长按 + Drag（推荐）** | `LongPressGesture.sequenced(before: DragGesture)`；拖中禁用外层滚动命中 | 保持纯 SwiftUI；与现有结构一致 | 需仔细处理与 `ScrollView` / `Button` 冲突 |
| **D2 仅边缘手柄拖** | 任务块侧边 handle | 误触少 | 周视图块窄，发现性差 |
| **D3 UIKit 桥接** | `UIViewRepresentable` 接管手势 | 滚动冲突更好控 | 与当前 Schedule 纯 SwiftUI 不一致，成本高 |

**推荐 D1**，必要时对 `TimelineGrid` 外包一层 `scrollDisabled` / 高优先级手势；若验证阶段手势不稳，再评估 D3 局部桥接。

### 4.3 模块拆分策略

`ScheduleHomeView.swift` 已约 3.2k 行。本需求建议：

- **新增**纯逻辑类型（可单测）：`TimelineGeometry`、`IdleCollapsePlanner`、`RescheduleMath`
- **TimelineGrid 内**接入几何与手势；状态上提至 `DayTimelineSection` / `WeekTimelineSection` 或 `ScheduleHomeView`
- **不**在本期做大规模文件拆分重构，但避免继续把算法堆进 View `body`

---

## 5. 拖拽改期设计

### 5.1 交互流程

```
单击任务     → 打开 TaskEditorView（现状）
长按任务     → 进入 dragging：放大/半透明 ghost + 触觉反馈
拖动         → ghost 跟随；落点预览线/高亮列（周）；**整点 snap**
松手         → 计算新 start/end → 乐观更新本地缓存 → PATCH → 成功用响应刷新；失败回滚 + 提示
拖到原位置   → 不发请求
拖到折叠条   → 临时展开该空闲段，继续拖（或松手落在展开后的对应分钟）
```

### 5.2 可拖规则

| 条件 | 行为 |
|------|------|
| `status ∈ {todo, doing, done}` 且存在可解析 `startAt`，且非全天 | 可拖 |
| `archived` | 不可拖 |
| 全天（`ScheduleFormat.isAllDay`） | 本期不可拖（Phase 2：全天行改日期） |
| 无 `startAt` | 日历时间轴不会出现；忽略 |
| PATCH 进行中同一任务 | 忽略新的 drop |

### 5.3 落点计算

```text
visualY → TimelineGeometry.minutes(atY:) → snapHour (60) → clamp [0, 24*60 - minDuration]
dayIndex ← x 相对 labelWidth / dayWidth（周模式）
newStart = startOfDay(days[dayIndex]) + snappedMinutes
duration = max(原 end-start, 缺省 60min)
newEnd   = newStart + duration   // 允许跨日，与 Web 一致，不截断到 23:59
```

周模式跨列：同时改日期与时刻。日模式仅改时刻（仍允许跨到次日若 duration 溢出，由后端日历展示处理）。

### 5.4 与滚动 / 点击冲突

1. 正常滑动：不触发长按完成 → 滚动优先。  
2. 长按成功：`isDragging = true` → 外层垂直滚动临时 `scrollDisabled(true)`（或等价）。  
3. 任务控件：拖拽态用 `DragGesture` 接管，避免 `Button` 在松手时误开编辑；可用「未发生有效位移则视为 tap」区分。  
4. 空白 `SpatialTapGesture`：拖拽进行中不响应新建。

### 5.5 数据与乐观更新

复用现有 todo 更新模式（`ScheduleHomeView` 内 PATCH + 本地 `ScheduleTask` 字段回写）：

1. 构造 `ItemUpdatePayload`（带 `version`，更新 `startAt`/`endAt`，其余字段原样）。  
2. 先写日历 cache（`view:anchor`）中对应 item。  
3. 成功：用 `ItemResponse` 更新 `version` 与时间。  
4. `409 version_conflict`：提示刷新，invalidate 相关 cache 并 reload。  
5. 其它错误：回滚该 task 时间，toast/alert。

不需要新 API。

### 5.6 视觉反馈（建议）

- 拖中：原位占位虚影（可选）+ 跟随 ghost；目标刻度短横线  
- 周：目标日列轻微 tint  
- 无障碍：拖开始/结束 VoiceOver 提示新时间（后续可增强）

---

## 6. 空闲时段折叠设计

### 6.1 空闲判定

对某一天（周则对每一列）：

1. 收集该日所有定时任务在 `[0, 24h)` 上的占用区间（与 `placement` 一致：按 start 日放置，duration clamp 到当日尾，与现状一致）。  
2. 合并重叠占用 → `busyRanges`。  
3. 补集 → `idleRanges`。  
4. 将 `idleRanges` 中长度 `≥ collapseThresholdMinutes`（默认 **120**）标为 **可折叠空闲**。  
5. 可选保护：  
   - 今天：保证「当前分钟 ± 30min」落入某可见段（必要时把该空闲拆开或强制展开包含当前时刻的一段）。  
   - 首尾过短空闲（如 0:00–7:00 若阈值 ≥ 阈值）仍可折，用一条折叠条表达。

全天任务不占时间轴 busy（与现状网格一致）。

### 6.2 几何模型（核心）

```text
TimelineSegment =
  | visible(startMin, endMin)           // 正常 hourHeight 比例展开
  | collapsed(startMin, endMin, id)     // 固定折叠条高度（如 28pt）

TimelineGeometry(segments, hourHeight, collapsedHeight):
  contentHeight
  y(forMinutes:) -> CGFloat
  minutes(atY:) -> Int          // 落在 collapsed 段：映射到该段代表分钟（中点）或拒绝（见 A10）
  isCollapsed(minutes) -> Bool
```

任务块、小时标签、虚线、当前时间线、拖拽预览 **全部** 经 `y(forMinutes:)` 定位；不再使用裸 `minutes/60*hourHeight`。

小时标签策略：

- `visible` 段内：按整点画标签（可只画段内整点）。  
- `collapsed` 段：折叠条上显示时间范围文案，如 `02:00 – 08:00 · 展开`。

### 6.3 日模式 vs 周模式

**日模式**

- 单列 segments，折叠条通栏。  
- 顶栏或时间轴上方提供总开关：「折叠空闲」/「展开全部」。  
- 每条折叠条自身可点：展开 **该段**（局部），再次「折叠空闲」收起所有达标空闲。

**周模式**

各天 busy 不同，有两种 UI：

| 子方案 | 描述 | 推荐 |
|--------|------|------|
| **W1 按行对齐（推荐）** | 先对 7 天分别算 idle；再取「至少 N 天可折且时间重叠」的公共空闲，或更简单：**以「7 天并集 busy」** 算全局空闲——只有七天都空的时段才折叠 | 视觉整齐，列对齐 |
| **W2 每列独立折叠** | 同 y 可能一列折一列不折 | 更省单列空间，但网格错位难读 |

**推荐 W1 + 并集 busy：**  
`weekBusy = union(dayBusy[0...6])`，再对补集做阈值折叠。这样折叠条跨 7 列对齐，符合日历阅读习惯。代价是「仅某天有空」不会折——可接受。

若审阅希望「更激进省空间」，可改为交集策略（任一有任务的小时全周展开），与并集相反；本方案默认并集。

### 6.4 折叠入口

1. **全局开关**（日/周工具条或时间轴顶部）：`折叠空闲` ↔ `展开全部`。  
2. **折叠条按钮**：文案 + chevron；点击展开该 `collapsed` 段为 `visible`（本 session）。  
3. 展开全部后，若用户再开折叠，按 A5/A6 重算。

状态建议：

```text
idleCollapseEnabled: Bool          // UserDefaults
locallyExpandedGapIDs: Set<String> // 内存，key = "\(dayOrWeekKey):\(start)-\(end)"
```

### 6.5 与新建 / 当前时间线

- 点空白：`minutes(atY:)` → 整点 snap → `onCreateTime`（逻辑不变）。  
- 点在折叠条：视为「展开该段」，不新建（避免盲建）。  
- `CurrentTimeLine`：用 `y(forMinutes: now)`；若所在段被折叠，依赖 A8 保护或隐藏线并在折叠条上标「现在」。

### 6.6 与拖拽联动

| 场景 | 行为 |
|------|------|
| 拖过折叠条 | 自动 `locallyExpandedGapIDs.insert` 该段，几何动画更新，便于精确落点 |
| 拖到其它可见段 | 正常 snap |
| 折叠开关切换时正在拖 | 取消拖拽或冻结几何至松手（推荐：**取消拖拽**，简单） |

动画：折叠/展开用 `withAnimation(.easeInOut(duration: 0.25))` 改 `contentHeight` 与 offset，避免跳变。

---

## 7. 架构与改动面

```text
ScheduleHomeView
  ├─ DayScheduleView / WeekScheduleView
  │    └─ DayTimelineSection / WeekTimelineSection
  │         ├─ AllDayRow / WeekAllDayRow          （本期不动或 Phase 2）
  │         └─ TimelineGrid                      （主改）
  │              ├─ TimelineGeometry             （新，纯逻辑）
  │              ├─ IdleCollapsePlanner          （新，纯逻辑）
  │              ├─ CollapseToggle / CollapseGapBar
  │              └─ TaskBlock + drag session
  └─ rescheduleTask(...)                         （新，PATCH + cache）

RescheduleMath.compute(...)                      （新，对齐 Web computeRescheduledRange）
```

### 7.1 建议新增文件（实现阶段）

| 文件 | 职责 |
|------|------|
| `Features/Schedule/TimelineGeometry.swift` | segments、y↔minutes、contentHeight |
| `Features/Schedule/IdleCollapsePlanner.swift` | busy/idle、阈值、周并集 |
| `Features/Schedule/RescheduleMath.swift` | snap、duration、ISO 输出 |
| （可选）`TimelineDragSession.swift` | 拖拽中状态机 |

单测优先覆盖三个纯逻辑类型；UI 用手测 + 现有 a11y id。

### 7.2 `TimelineGrid` API 扩展（示意）

```swift
// 新增回调 / 状态（示意，非最终签名）
var idleCollapseEnabled: Bool
var onToggleIdleCollapse: () -> Void
var onReschedule: (ScheduleTask, Date, Date) -> Void  // newStart, newEnd
```

小时锚点 id（`hour-\(hour)`）在折叠后可能不连续存在：滚动定位「某小时」时需改为 `y(forMinutes:)` + `scrollTo` 代理，或保证可见段内仍有对应 id。实现阶段需回归「跳到某日/定位」行为。

---

## 8. 分阶段落地（实现时）

| Phase | 内容 | 依赖 |
|-------|------|------|
| **P0** | `TimelineGeometry` + `IdleCollapsePlanner` + 日模式折叠 UI + 总开关 | 无 |
| **P1** | 周模式折叠（并集 busy + 对齐折叠条） | P0 |
| **P2** | 日模式拖拽改期（含折叠坐标） | P0 |
| **P3** | 周模式跨列拖拽 + 拖经折叠条自动展开 | P1+P2 |
| **P4**（可选） | 全天行改日期；拖拽 resize 时长 | 产品确认 |

建议评审通过后按 P0→P3 顺序实现；P0/P1 即可单独交付「折叠」价值。

---

## 9. 风险与对策

| 风险 | 对策 |
|------|------|
| 长按与 `ScrollView` 抢手势 | 长按识别成功后 `scrollDisabled`；调 `minimumDuration` |
| `ScheduleHomeView` 过大难测 | 算法外置 + 单测 |
| 折叠后高度变化导致分页跳动 | 折叠状态按「日/周 section」局部，避免改相邻页；动画中禁用 scrollTo |
| 拖拽整点 vs 新建 15 分钟 | 刻意区分：拖拽对齐 Web 整点；新建保持 15 分钟 |
| 跨日 timed 任务仍只画在 start 日 | 保持现状；拖完 reload 后仍按现 placement |

---

## 10. 验证计划（实现后）

1. **单测**：`IdleCollapsePlanner`（无任务整天、单点任务、跨小时、阈值边界、周并集）；`TimelineGeometry`（往返 y↔minutes、折叠条命中）；`RescheduleMath`（整点 snap、保时长、跨日）。  
2. **手测日模式**：稀疏日程自动折叠 → 展开条 → 展开全部 → 再折叠；点空白新建落在真实时间；当前时间线可见。  
3. **手测周模式**：仅一天有早会时，深夜公共空闲可折；七天对齐。  
4. **拖拽**：日/周改期成功；同位置不请求；archived 不可拖；409 回滚；拖过折叠条自动展开后落点准确。  
5. **回归**：单击仍进编辑；纵向翻日/翻周；点空白新建；重叠 lane 布局。

---

## 11. 拍板记录（2026-09-06）

| 问题 | 决定 |
|------|------|
| 折叠阈值 ≥2h | **合适** |
| 默认自动折叠 | **是** |
| 周模式 | **并集对齐（W1）** |
| 拖拽 snap | **对齐 Web（整点）** |
| 全天 / resize | **不纳入本期** |
| 折叠入口 | 时间轴顶栏开关 + 折叠条（未要求进设置页） |

---

## 12. 结论

- **折叠**：C1 压缩条 + `TimelineGeometry`；日模式按天算；周模式 **并集 busy + 对齐折叠条**；默认自动折叠；阈值 2h。  
- **拖拽**：D1 长按拖移；保时长；**整点 snap**；仅定时任务；与折叠共用几何；API 复用 PATCH。  
- **实现计划**：`docs/superpowers/plans/2026-09-06-ios-calendar-drag-collapse.md`  
- **示意图**：
  - `docs/design-references/assets/ios-day-timeline-collapsed.png`
  - `docs/design-references/assets/ios-week-timeline-collapsed.png`
  - `docs/design-references/assets/ios-day-timeline-drag.png`
