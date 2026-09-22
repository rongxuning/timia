# 日程地图：重叠任务箱子与扑克扇形 — 设计规格

**Date:** 2026-09-22  
**Scope:** Web 与 iOS 日程地图模式：同一地点多任务时收成箱子，点开后扑克扇形展开并用轮盘滑动浏览  
**Out of scope:** 后端 / OpenAPI；缩放级「不同地点」聚合；箱子或扇形内改期 / 改状态 / 删除；地图上新建或拖拽改坐标；导航 / 路线；规划（Plans）；MCP

**Depends on:**  
[2026-09-15-web-task-location-map-design.md](./2026-09-15-web-task-location-map-design.md)  
[2026-09-18-ios-schedule-map-design.md](./2026-09-18-ios-schedule-map-design.md)

## Goal

1. 同一地点（或坐标几乎重合）的多条任务，地图上只出现 **一个箱子**，不再互相整张遮盖。
2. 点箱子后，任务像扑克牌从箱子里展开成扇形；左右滑动像轮盘一样转牌。
3. 正中那张点一下，走现有任务详情（Web 抽屉，iOS 编辑 sheet）。
4. 单任务地点的标记与点按路径不变。

---

## Decisions

| Topic | Choice |
|-------|--------|
| 分组 | 坐标 6 位小数相同，或与箱内每一条的距离都 ≤ **30 米** |
| 箱子位置 | 组内出现次数最多的 6 位坐标；并列取先出现的那条 |
| 关闭态文案 | 地点名 + 数量；**不**显示任何一条任务的时间 / 状态 / 优先级色 |
| 打开态 | 扑克扇形锚在箱子上；地图不平移、不缩放 |
| 浏览 | 横向拖动手跟手转扇；松手按速度滑一段后吸附最近一张 |
| 循环 | **不循环**；首尾回弹 |
| 同时打开 | 同一时刻只开一个箱子 |
| 点牌 | 点两侧露出的牌 → 转到正中；点正中牌 → 收起并打开该任务 |
| 收起 | 点地图空白、再点箱子、向下甩回、Esc |
| 缩放聚合 | **不做**不同地点的 zoom cluster |
| 后端 | **不改** `GET /views/schedule/map` |

### Approaches considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. 箱子 + 扑克扇形轮盘（推荐）** | 一眼看出「这里有多条」；浏览不离开地图；和单任务卡形态连续 | 实现量比列表大；要处理屏幕边缘 | **采用** |
| B. 继续叠卡，标题写「等 N 项」，点开 popup / action sheet | 已有代码 | 叠卡仍会整张遮住；关闭态看起来仍是一条任务 | 拒绝 |
| C. 缩放到最大仍重合才弹列表，否则只做 MapLibre cluster | 和早期 Web 规格接近 | 同地址搜索出来的坐标差几米时永远展不开；iOS MapKit 没有同套 cluster | 拒绝 |

---

## 1. 现状问题

Web（`scheduleMapPins.ts`）和 iOS（`groupScheduleMapItemsByCoordinate`）已经按 6 位小数合成一组，标记标题是「第一条标题 等 N 项」，时间和状态仍是第一条。

缺口：

1. **关闭态仍是一张任务卡**，其余任务等于没出现。
2. **坐标差几米**（同一栋楼、同一次地址搜索的抖动）不会合成，多张大卡片叠在一起，后画的完全挡住前面。
3. 打开态：Web 是地图气泡列表，iOS 是系统 `confirmationDialog`，两端不一致，也看不出「从箱子里抽出一叠牌」。

---

## 2. 怎样算同一个箱子

对当前筛选结果里的 `items` 在客户端分组。不改 API。

### 2.1 距离

Haversine，地球半径 **6 371 000 m**。输入是任务自带的 WGS-84 `location_lat` / `location_lng`。不要用转换后的 GCJ-02 去算距离（iOS 钉点显示仍按现有 `ChinaCoordinate` 转，但分组用原始 WGS-84）。

### 2.2 算法（原点聚类，避免沿街串成一条）

分两步，都按接口返回顺序：

1. 先用现有 `groupScheduleMapItemsByCoordinate` 按 6 位小数 key（`lat,lng` 各 `toFixed(6)` / `%.6f`）分桶。同一 key 的任务**必须**在同一箱子，后面不再拆开。
2. 再按桶扫描合并：桶的代表点 = 该桶第一条任务的坐标。并入已有箱子当且仅当代表点到该箱 **每一条** 已有任务的距离都 ≤ 30 米（完全连接，避免沿街传递）。多个箱子都满足时，取到箱子原点最近的那个。都不满足则新开箱子。原点 = 该箱第一个桶的代表点，之后不改。

30.0 米算同一箱子；大于 30 米算两个箱子。单测用固定点对锁住这条边界。

沿街两家店相距 40 米：两个箱子。同一栋楼两次搜索差 8 米：一个箱子。A–B 25 米、B–C 25 米、A–C 50 米：无论接口顺序如何，A 与 C 都不会进同一箱（二者超过 30 米）。

### 2.3 箱子锚点与名称

| 字段 | 规则 |
|------|------|
| `id` | 原点坐标的 6 位 key。只用于 React / SwiftUI 稳定身份，不展示 |
| `coordinate` | 组内 6 位 key 出现次数最多的坐标；并列取先出现的 |
| `placeTitle` | 组内非空 `location` trim 后出现次数最多的字符串；并列取先出现的。全部为空则用 i18n「这个地点」 |
| `items` | 见 2.4 排序 |
| `count` | `items.length` |

`count == 1` 画现有单任务卡，点一下直接打开该任务。  
`count >= 2` 画箱子。

### 2.4 箱内排序

稳定排序：

1. 有 `start_at` 的在前，按 `start_at` 升序。
2. 无 `start_at` 的在后，保持接口相对顺序。
3. `start_at` 相同：按 `title` locale 升序，再按 `id`。

打开箱子时，正中放 **焦点任务**：

1. 有 `start_at >= now` 的，取其中最早的一条。
2. 否则取排序后的第一张。

`now` 用打开瞬间的本地时钟，打开后不再因时间流逝自动换焦点。

---

## 3. 关闭态：任务箱子

```
        ┌─────────────────┐
      ┌─┤  文汇小区      3 │
    ┌─┤ └─────────────────┘
    │ 3 个任务            │
    └─────────────────────┘
              ●
```

| 元素 | 规则 |
|------|------|
| 层叠 | 后面露出 2 层卡片边（右上各错开 4px）。层数固定为 `min(count - 1, 2)`，不按真实数量无限加厚 |
| 主文案 | `placeTitle`，单行截断 |
| 角标 | 阿拉伯数字 `count`，封顶展示 `99+`（内部仍按真实 count 分组） |
| 副文案 | 「N 个任务」（en：`{count} tasks`） |
| 颜色 | 中性表面（Web `bg-surface` + `border-border-subtle`；iOS `TimiaTheme.surface`）。**不用**第一条任务的优先级 accent 填满箱子 |
| 钉点 | 保留现有底部圆点，颜色用中性主色 / `TimiaTheme.primary`，表示「这里」，不表示某条任务 |
| 命中 | 整颗箱子（层叠边 + 主卡 + 钉点）都可点 |

读屏：`{placeTitle}，{count} 个任务，点按查看`。`aria-expanded` / `accessibilityAddTraits(.isSelected)` 在打开时为真。

Web 现有 `moreItems`「{title} 等{count}项」不再用于地图标记（单测改成箱子文案）。新增 i18n：

| key | zh | en |
|-----|----|----|
| `chestTasks` | `{count} 个任务` | `{count} tasks` |
| `chestAria` | `{place}，{count} 个任务，点按查看` | `{place}, {count} tasks, double tap to open` |
| `chestPlaceFallback` | `这个地点` | `This place` |
| `fanPosition` | `{current} / {total}` | `{current} / {total}` |
| `fanAria` | `第 {current} 张，共 {total} 张，{title}，{time}，{status}` | `Card {current} of {total}, {title}, {time}, {status}` |

iOS 用同语义的中文硬编码（与现有日程地图一致）。

---

## 4. 打开态：扑克扇形

### 4.1 几何

扇形锚在该箱子的屏幕位置，从箱子向上张开。地图相机不动。

| 参数 | Web | iOS |
|------|-----|-----|
| 弧半径 | 168px | 168pt |
| 相邻张角步 | 16° | 16° |
| 同时可见 | 正中 1 + 左右各 2 | 同左 |
| 正中 | scale 1.00，opacity 1.00，rotation 0° | 同左 |
| ±1 | scale 0.88，opacity 0.86，rotation ±16° | 同左 |
| ±2 | scale 0.76，opacity 0.56，rotation ±32° | 同左 |
| 更外侧 | 不渲染；从左右沿弧滑入滑出 | 同左 |

牌面内容与现有单任务卡一致：左侧优先级色条、标题、时间、状态。已完成 / 已归档沿用现有降饱和。不在牌上画地点名（地点已经在箱子上）。

每张牌宽度约 200px / 200pt，高度随三行文案，圆角与现有钉点卡一致（Web `rounded-xl`，iOS 10pt continuous）。

正中 z-index 最高，越靠边越低，避免斜牌切到正中标题。

### 4.2 展开 / 收起动画

| 阶段 | 时长 | 行为 |
|------|------|------|
| 箱子打开 | 120ms | 箱子轻微上浮并张开层叠（scale 1.04） |
| 出牌 | 320ms，每张错开 40ms | 从箱子中心飞到扇形槽位；顺序按箱内排序 |
| 吸附 | 220ms | 松手后弹到最近整数 index |
| 收起 | 280ms，反向错开 32ms | 牌按相反顺序飞回箱子，箱子回关闭态 |

缓动：展开 `ease-out`，收起 `ease-in`，吸附用弹簧（阻尼，一次过冲不超过 8%）。

只有 2 张也走同一套扇形和手势，只是左右不对称（正中 + 一侧一张）。

超过 5 张：弧上始终最多 5 张，其余从两侧进出。上方计数「当前序号 / 总数」，例如 `2 / 8`。序号从 1 起。

### 4.3 屏幕边缘

用箱子的屏幕坐标决定扇形朝向，**不移动箱子、不移动地图**。

| 箱子位置 | 扇形 |
|----------|------|
| 默认 | 向上张开 |
| 顶边不足弧半径 + 牌高 + 24 | 改为向下张开，几何参数镜像 |
| 左右不足半扇宽 | 整扇向屏幕内平移，最大不超过让正中牌仍压在箱子正上方 / 正下方的垂直线上偏移 48px。再不够则减小角步到最低 10° |

实现时先算理想槽位，再做一次钳制；不要改分组坐标。

---

## 5. 轮盘滑动

交互面是整块扇形（含正中和两侧露出的牌），不是地图。

| 手势 | 行为 |
|------|------|
| 横向拖 | 整扇沿弧转动，跟手。位移换算：`deltaIndex = -dx / 148`（148px/pt = 一张）。`index` 可为小数 |
| 松手 | `index` 先加 `clamp(vx / 900, -1.25, 1.25)`，再四舍五入到最近整数，再钳到 `[0, count-1]`，然后 220ms 吸附 |
| 首尾 | 超出部分乘 0.35 阻力；松手弹回 0 或 `count-1`。**不循环** |
| 向下甩 | `vy > 800` 且 `|vy| > |vx|`：收起扇形，不翻牌 |
| 点 vs 拖 | 按下后位移 < 8px / 8pt 且 `|v| < 200` px/s（iOS 同数值 pt/s），视为点按；否则视为拖 |
| 点两侧牌 | 吸附到那张，**不**打开任务 |
| 点正中牌 | 收起扇形（走收起动画），动画结束后打开该任务的现有详情 |
| 点箱子 | 若已打开：收起。若关闭：打开 |
| 点地图空白 / 点另一个箱子 | 先收起当前；若点的是另一个箱子，收起完成后再打开那个 |
| Web 键盘 | `ArrowLeft` / `ArrowRight` 一次一张；`Enter` / `Space` 打开正中；`Escape` 收起 |
| 滚轮 | 忽略，避免和地图缩放抢手势 |

打开扇形期间：

- **锁住地图**平移和缩放。Web：打开期间 `dragPan.disable()`、`scrollZoom.disable()`、`touchZoomRotate.disable()`，收起后恢复。iOS：打开期间 `Map` 设 `interactionModes: []`，收起后恢复默认。扇形以外的点击仍算「点空白」并收起。
- 筛选变化或 `items` 刷新：若当前打开箱子的任务 id 集合与刷新前不同，立刻收起且不播完整收起动画。id 集合相同则保持 index（若原 index 越界则钳到末张）。
- 打开任务详情后扇形已收起；保存 / 删除返回地图时按现有 `refreshNonce` 刷新，不自动重开箱子。

读屏：每转到一张通报「第 {n} 张，共 {count} 张，{title}，{time}，{status}」。提示「左右滑动切换，点按打开」。箱子按钮在打开时 `aria-expanded=true`。

---

## 6. 两端形态

交互状态机相同，容器跟现有地图走。

```
关闭 ──点箱子──► 展开中 ──► 已打开（可拖、可点牌）
                  ▲                │
                  │                ├─点正中──► 收起中 ──► 打开任务详情
                  │                ├─点空白 / Esc / 下甩 / 再点箱子──► 收起中 ──► 关闭
                  └──点另一箱子：先走收起中，完成后再展开新箱子
```

### Web

- 继续 MapLibre + 自定义 HTML Marker。单任务仍用 `createScheduleMapPinElement`。
- 多任务 Marker 换成箱子 DOM（`createScheduleMapChestElement`）。
- 扇形不要复用现在的 `maplibregl.Popup` 列表。在画布上用绝对定位 overlay，用 `map.project` 跟箱子坐标，窗口 resize / 若相机被外部改动时重算。
- `onItemClick` 仍由页面打开 `TaskDrawerWithComments`。
- 用户可见文案走 `scheduleMap.*` 的 zh / en key，改完跑 `npm run test:i18n`。

### iOS

- 去掉 `confirmationDialog("选择任务")`。
- 箱子是 `Annotation` 里的 `ScheduleMapChestLabel`。
- 扇形是盖在 `Map` 上的 overlay：用 `MapReader` 把箱子坐标转成屏幕点，不要把扇形做进 `Annotation`（避免被标注裁切、也避免和 Map 手势抢）。手势用 `DragGesture`，`predictedEndTranslation` 参与速度。
- 点正中牌走现有 `onTaskTap` → `TaskEditorView(mode: .edit)`。
- 文案继续中文硬编码，与现有 `ScheduleMapView` 一致。

两端都 **不** 在箱子或扇形里改坐标、改时间、改状态。

---

## 7. 技术边界

纯函数与平台 UI 分开，Web / iOS 各写一份同语义实现（现有分组已经是这个模式）。

| 单元 | 路径（建议） | 职责 |
|------|----------------|------|
| 分组 / 排序 / 焦点 | Web `codes/web/src/lib/scheduleMapClusters.ts`；iOS `ScheduleMapFilters.swift` 旁或新 `ScheduleMapClusters.swift` | 30 米聚类、锚点、placeTitle、排序、初始焦点 index |
| 轮盘数学 | 同目录 `scheduleMapFan.ts` / `ScheduleMapFan.swift` | `deltaIndex`、阻力、松手吸附、可见窗口 ±2 |
| 单测 | `scheduleMapClusters.test.ts`、`scheduleMapFan.test.ts`；`ScheduleMapFiltersTests` 或新 `ScheduleMapClustersTests` | 锁住 30 米边界、串街不合并、排序、吸附 |
| 箱子 DOM / View | Web `scheduleMapPins.ts` 增补；iOS `ScheduleMapChestLabel` | 关闭态 |
| 扇形 overlay | Web `ScheduleMapFanOverlay.tsx`（由 `ScheduleMapCanvas` 挂）；iOS `ScheduleMapFanOverlay` | 动画、手势、点牌 |
| 画布接线 | `ScheduleMapCanvas.tsx`、`ScheduleMapView.swift` | 单卡 vs 箱子、锁地图、打开详情 |

`groupScheduleMapItemsByCoordinate` 只做 6 位相同分组，供单测和 `clusterScheduleMapItems` 内部第一步使用。对外画点只走 `clusterScheduleMapItems`（6 位分组 + 30 米原点合并）。

不改：

- `GET /views/schedule/map`
- 日历 / 四象限 / 泳道
- 任务抽屉 / iOS TaskEditor 内部
- 健康页路线图

---

## 8. 错误与空态

| 情况 | 行为 |
|------|------|
| 筛选后某箱子只剩 1 条 | 变成普通单任务卡；若该箱正打开则收起 |
| 筛选后箱子被清空 | 标记消失；若正打开则收起 |
| 地图加载失败 | 沿用现有错误条 / toast，不进入扇形 |
| 打开详情失败 | 扇形已收起；走现有抽屉 / sheet 错误，不自动重开 |

---

## 9. 测试

### Web

- `clusterScheduleMapItems`：分坐标保持两箱；同 6 位合成一箱；29.9m 合一、30.1m 分开；A–B–C 链式 25m 不把 A 与 C 收进一箱。
- 关闭态不再出现「{title} 等{count}项」。
- 锚点取众数坐标；`placeTitle` 取众数地点名。
- 排序：有时间升序，未排期在后。
- 焦点：未来最近一条；全是过去则第一张。
- `scheduleMapFan`：`dx=148` → index -1；首尾阻力；速度钳制后四舍五入。
- i18n：`npm run test:i18n`。

### iOS

- 与 Web 同语义的聚类 / 排序 / 焦点 / 吸附单测（`TimiaTests`）。
- 回归：单任务点 Annotation 仍直接 `onTaskTap`；不再出现「选择任务」系统菜单。

### 手动

- 同一搜索地址两条任务 → 一个箱子，角标 2。
- 点开 → 扇形从箱子长出；左右拖能换牌；点正中进详情。
- 点空白收起；打开时地图拖不动。
- 箱子靠近顶 / 左右边缘，扇形仍完整可见。
- 筛掉部分状态后箱子数量或单卡形态更新正确。

---

## 10. Explicit non-goals（这一期）

- 服务端按地点聚合
- 按当前缩放把不同街区收成数字气泡
- 扇形里完成 / 改期 / 删任务
- 用户可配置 30 米阈值
- 循环轮播
- Web / iOS 之外的客户端

---

## Resolved decisions

| # | Question | Decision |
|---|---------|----------|
| 1 | 关闭态用任务卡摘要还是箱子？ | **箱子**（地点 + 数量 + 层叠） |
| 2 | 打开态用列表还是扑克扇形？ | **扑克扇形 + 横向轮盘** |
| 3 | 只合完全相同坐标，还是也合近距离？ | **6 位相同，或与箱内每一条都 ≤ 30 米** |
| 4 | 30 米是否沿街传递合并？ | **不**。必须与箱内每一条都 ≤ 30 米 |
| 5 | 两端是否同一交互？ | **是**。Web overlay / iOS overlay，不用 iOS 系统菜单 |

---

## Success criteria

- 同一地点多任务时，地图上只能点到一个箱子，看不到被整张盖住的第二张任务卡。
- 点箱子能看到该地点全部任务，并可用轮盘滑到任意一张。
- 点正中牌打开的是那一张，不是箱子里的第一条。
- 单任务地点行为与现在一致。
- 无后端协议变更。
