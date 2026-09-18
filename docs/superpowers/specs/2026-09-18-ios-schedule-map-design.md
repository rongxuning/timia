# iOS 日程地图模式 — 设计规格

**Date:** 2026-09-18  
**Scope:** iOS App 日程主页新增「地图」模式：底栏入口（日历与便利贴之间）、MapKit 展示带坐标任务、标记显示名称/时间/优先级色、上方状态与空间/项目筛选  
**Out of scope:** iOS 任务编辑里的地址搜索（`/geo/places`）；在地图上新建/拖拽改坐标；导航/路线；聚合点二级列表的复杂编辑；计划（Plans）；MCP；Web 改动；后端协议变更

**Depends on:** [2026-09-15-web-task-location-map-design.md](./2026-09-15-web-task-location-map-design.md)（已落地的 `location_lat`/`location_lng` 与 `GET /views/schedule/map`）

## Goal

1. 用户在 iOS 日程主页能切换到地图模式，看到自己参与的、带 WGS-84 坐标的任务钉在地图上。
2. 每个标记能辨认出**任务名称、时间、优先级**（用颜色）。
3. 地图上方可筛：**状态**（多选）、**工作空间**、**项目**（级联）。
4. 点标记打开现有任务编辑 sheet，保存后刷新地图。

---

## Decisions

| Topic | Choice |
|-------|--------|
| 入口位置 | 底栏 `ContentMode` 顺序：`todo` → `calendar` → **`map`** → `stickyNote`（地图夹在日历与便利贴之间） |
| 页面形态 | 与日历/Todo/便利贴同级的第四种模式，不是日历日/周/月/年的第五档 |
| 地图 SDK | **MapKit**（SwiftUI `Map`），不用 MapLibre / 第三方瓦片 |
| 坐标系 | 库内与 API 均为 **WGS-84**；直接喂给 `CLLocationCoordinate2D` |
| 数据源 | 复用现有 `GET /views/schedule/map`；**不改** core-service |
| 默认筛选 | 状态 `todo` + `doing`；工作空间/项目 = 全部 |
| 标记色 | **优先级 accent**（与 `SchedulePriorityStyle` 一致）；`task.color` 非 `#FFFFFF` 时可作为钉点描边或次要强调，一期以优先级主色为准（满足「用颜色标记优先级」） |
| 时间文案 | 复用现有日程时间格式化（全日 / 起止 / 仅开始）；无 `start_at` 显示「未排期」 |
| 用户定位 | 一期**不主动请求**定位、不显示蓝点；看任务分布不需要用户坐标。已有便利贴定位文案不必因本功能改写 |
| 点击标记 | 打开现有 `TaskEditorView(mode: .edit)` sheet |
| 同坐标多任务 | 选中该坐标后弹出简短列表（标题 + 时间），再进编辑；避免钉点互相挡住无法点开 |
| 底栏右侧操作 | 地图模式与日历相同：保留「新建任务」+ 语音解析（不新建「在地图上加点」） |
| 筛选状态持久化 | 进程内 `@State` 即可；不强制 `@AppStorage`（与 Web session 默认回日历一致） |

### Approaches considered

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| **A. MapKit + `/views/schedule/map`（推荐）** | 零后端改动；与 Web 筛选语义对齐；原生性能与离线瓦片缓存 | 标记 callout 样式不如 Web popup 自由 | **采用** |
| B. 客户端拉 swimlane/calendar 再本地滤坐标 | 少一个 API | iOS 尚无 lat/lng 模型；日历有时间窗，地图要「全量带坐标」；重复造筛选 | 拒绝 |
| C. 嵌入 WKWebView 复用 Web MapLibre | UI 一致 | 鉴权/会话不同（移动端 challenge）；体积与交互割裂 | 拒绝 |

---

## Product / UX

### 底栏入口

当前（`ScheduleHomeView.bottomControls`）：

```
[ checklist | calendar | highlighter ]   [ + ] [ mic ]
```

目标：

```
[ checklist | calendar | map | highlighter ]   [ + ] [ mic ]
```

- SF Symbol：`map`（选中态与现有 modeButton 一致：深色胶囊底 + 白图标）
- `accessibilityLabel`：`地图模式`
- 切到地图时收起日历的日/周/月/年 popover；不显示 `DateStrip`
- Header 标题：可用「地图」或当日完整日期（与便利贴模式一样用今日全日期亦可）；推荐固定文案 **「地图」**，避免与日历日期导航混淆

### 页面结构

```
┌─────────────────────────────────────┐
│  Header（地图 / 账户入口等沿用）      │
├─────────────────────────────────────┤
│ 状态  [未开始] [进行中] [已完成] [已归档] │
│ 范围  [空间 ▾ 全部]  [项目 ▾ 全部]  n个 │
├─────────────────────────────────────┤
│                                     │
│              MapKit 地图             │
│         ● 任务名                     │
│           今天 14:00–15:00           │
│                                     │
└─────────────────────────────────────┘
│ [todo][日历][地图][便利贴]  [+] [mic] │
└─────────────────────────────────────┘
```

- 筛选条在地图**上方**（非浮在瓦片上的 overlay），窄屏折行。
- 地图 `frame(maxWidth/Height: .infinity)`，背景 `TimiaTheme.surface`。

### 筛选行为（对齐 Web）

| 控件 | 行为 |
|------|------|
| 状态 chip | 多选；`todo`/`doing`/`done`/`archived`；至少保留一个（取消最后一个忽略） |
| 工作空间 | `GET /workspaces/cards`；首项「全部」；改空间则项目重置为全部并重拉项目列表 |
| 项目 | 未选空间时禁用且为「全部」；选空间后 `GET /workspaces/{id}/projects` |
| 计数 | `total`；若 `truncated` 显示「前 n 个地点」 |

筛选变化 → 重新请求 `/views/schedule/map`（可 `Task` 取消上一次，避免乱序）。

### 标记展示

每个 `ScheduleMapItem` → 一个 `Annotation`（或 `Marker` + 自定义 label）：

1. **钉点颜色** = 优先级 accent：
   - `"1"` / 缺省 → `#3B82F6`
   - `"2"` → `#22C55E`
   - `"3"` → `#EAB308`
   - `"4"` → `#EF4444`
2. **名称**：`title`，单行截断
3. **时间**：本地化起止；无开始时间 →「未排期」
4. 已完成（`done`/`archived`）：钉点可略降饱和（复用现有 `desaturateHex` 思路），名称不强制删除线（地图信息密度高）

相机：

- 有结果：`MapCameraPosition` fit 所有坐标，padding ≥ 48pt；单点 zoom ≈ 14
- 空结果：中国概览约 `(lng: 105, lat: 35, zoom: 4)`，叠加空状态文案
- 空文案：
  - 默认筛选仍空：「还没有带地点的任务。在网页添加任务并搜索地址后会出现在这里。」
  - 筛空：「没有符合筛选条件的地点任务。」

### 交互

- 单任务坐标：点标记 → `selectedTask = item` → 现有 edit sheet
- 同坐标多任务：点该处 → 半屏/action sheet 列表 → 再打开编辑
- 编辑保存/删除地点后：`loadMap(force: true)`
- 加载中：地图半透明或顶部 Progress；错误 toast（复用 `errorTip`）
- 一期不在地图上改坐标

---

## Technical design

### 后端

**无变更。** 直接使用：

```
GET /views/schedule/map
  scope=me
  status=todo&status=doing   # 可重复
  workspace_id?
  project_id?                # 须伴随 workspace_id
  limit=500
```

响应：`{ items: ScheduleMapItem[], total, truncated }`，每项含必填 `location_lat`/`location_lng` 及完整日程任务字段。

### iOS 模块边界

| 单元 | 路径（建议） | 职责 |
|------|----------------|------|
| 模型 | `Core/API/APIModels.swift` | `ScheduleMapItem`、`ScheduleMapView`；`ScheduleTask` 增加可选 `locationLat`/`locationLng`（日历解码兼容） |
| API | `ScheduleHomeView` 内请求或抽 `ScheduleMapLoader` | `APIClient.request("/views/schedule/map", query:…)` |
| 筛选状态 | `Features/Schedule/ScheduleMapFilters.swift` | 默认值、toggle 状态、级联清项目；纯函数便于单测 |
| 优先级色 | 抽公共 `SchedulePriorityStyle` 到 `Features/Schedule/` 可共享文件 | 地图钉点与日历卡片同源，消掉 `ScheduleHomeView` / `ScheduleView` 两套略不一致的 private 实现 |
| UI | `Features/Schedule/ScheduleMapView.swift` | 筛选条 + `Map` + 空/错/加载 |
| 标注 | 同文件或 `ScheduleMapAnnotationView.swift` | 钉点 + 名称/时间 label |
| 入口 | `ScheduleHomeView.swift` | `ContentMode.map`、modeButton、content 分支、`loadMap` |

`project.yml`：新 Swift 文件落在现有 `Timia/Features/Schedule` sources 下即可（XcodeGen 通配则无需改；若显式列表则补上）。

### 模型草图

```swift
struct ScheduleMapItem: Codable, Identifiable, Hashable, Sendable {
    // 与 ScheduleTask 字段对齐，且 lat/lng 非 Optional
    let id: String
    var title: String
    // …
    var location: String?
    var locationLat: Double
    var locationLng: Double
    var workspaceId: String
    var workspaceName: String
    var projectId: String
    var projectName: String
}

struct ScheduleMapViewResponse: Decodable, Sendable {
    let items: [ScheduleMapItem]
    let total: Int
    let truncated: Bool
}
```

`ScheduleTask` 同步加：

```swift
var locationLat: Double?
var locationLng: Double?
```

（`convertFromSnakeCase` 已有；旧响应缺字段用 decode 默认 nil。）

### 查询构造

```swift
var items: [URLQueryItem] = [
    .init(name: "scope", value: "me"),
    .init(name: "limit", value: "500"),
]
for status in filters.statuses {
    items.append(.init(name: "status", value: status))
}
if let workspaceId = filters.workspaceId {
    items.append(.init(name: "workspace_id", value: workspaceId))
}
if let projectId = filters.projectId {
    items.append(.init(name: "project_id", value: projectId))
}
```

工作空间列表：`/workspaces/cards`（与 TaskEditor / StickyNotes 一致）。  
项目列表：`/workspaces/{id}/projects`。

### `ScheduleHomeView` 接线要点

1. `ContentMode` 增加 `map`；`modeButton` 顺序插入在 calendar 与 stickyNote 之间。
2. `onChange(of: contentMode)`：`.map` → `await loadMap()`。
3. `loadVisibleContent`：地图模式走 `loadMap`。
4. 地图模式不加载日历缓存、不显示 DateStrip / range picker。
5. `selectedTask` sheet 关闭刷新时，若当前是 map 则 `loadMap(force: true)`。

### MapKit 实现要点（iOS 17+）

- `Map(position: $cameraPosition) { ForEach(items) { … Annotation(…) { … } } }`
- `coordinate`：`CLLocationCoordinate2D(latitude: lat, longitude: lng)`
- 避免每个筛选刷新重建整棵 Map（用 `id` 稳定的 Annotation；相机只在「首次有数据 / 筛选结果集合变化」时 fit，用户手势平移后不要强制拉回）
- 不引入 `MapKit` 以外的地图依赖；`import MapKit` + SwiftUI

### 测试

| 测试 | 内容 |
|------|------|
| `ScheduleMapFiltersTests` | 默认状态；toggle 保底一个；改 workspace 清 project；未选空间时 setProject 无效 |
| `APIModelsTests` | 解码 map 响应含 lat/lng；`ScheduleTask` 缺 lat/lng 仍可解码 |
| UI（可选） | accessibility：`地图模式` 按钮存在；进入后可见状态 chip |

手动：模拟器有坐标任务 → 钉点颜色与四象限优先级一致；筛 done → 仅完成；改空间 → 项目重置；点钉 → 编辑 sheet。

### 文案

iOS 目前多为中文硬编码（与现有 Schedule 一致）。关键字符串：

- 「地图模式」「未开始」「进行中」「已完成」「已归档」
- 「全部空间」「全部项目」「未排期」
- 「n 个地点」「前 n 个地点」
- 空状态两句（见上）
- 「加载失败」走现有 tip

---

## Explicit non-goals（一期）

- TaskEditor 地点搜索 / 写入坐标（用户仍可通过 Web 录入坐标；iOS 只读展示）
- 显示用户当前位置 / 导航到任务
- 地图上长按新建任务
- Cluster 数字气泡（同坐标用列表即可；过密时可后续加）
- 改 Info.plist 定位文案（本功能不依赖定位权限）

---

## Implementation order（落地时）

1. 模型 + 筛选纯函数 + 单测  
2. `ScheduleMapView` UI（可先用假数据钉点）  
3. 接 `/views/schedule/map` + 空间/项目列表  
4. `ScheduleHomeView` 接入第四模式与刷新  
5. 同坐标列表 + 编辑回写刷新  
6. 抽共享 `SchedulePriorityStyle`（若改动面可控）  
7. 模拟器/真机走查  

---

## Open questions（实现前可默认）

| # | Question | Default if unanswered |
|---|----------|------------------------|
| 1 | Header 显示「地图」还是今日日期？ | **「地图」** |
| 2 | 钉点是否叠加任务自定义 `color`？ | 一期**只用优先级色** |
| 3 | 是否在地图模式隐藏「+ / 语音」？ | **保留**（与日历一致） |
| 4 | 是否 persist 上次筛选？ | **不 persist** |

---

## Success criteria

- 底栏日历与便利贴之间可进地图模式  
- 有坐标的 todo/doing 任务出现在地图上，可见名称、时间、优先级色  
- 状态 / 空间 / 项目筛选与 Web 语义一致，且只影响地图请求  
- 点标记能打开并编辑任务；保存后地图更新  
- 无后端 / OpenAPI / Web 变更  
