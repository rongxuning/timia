# Web 任务地点搜索与日程地图视图 — 设计规格

**Date:** 2026-09-15  
**Scope:** Web 任务创建/编辑抽屉的地址搜索；`/my/schedule` 地图视图（标记、状态筛选、工作空间/项目筛选）  
**Out of scope:** iOS 地址搜索与 iOS 地图；计划槽位（plan slot）地点结构化；自然语言解析自动地理编码；在地图上新建任务；导航/路线；项目页 `ScheduleBoard` 内嵌地图；腾讯/高德/Nominatim 等其它搜索供应商

## Goal

1. 用户添加或编辑任务时，能在页面内搜索具体地址，选定后同时记录**名称**和 **WGS-84 坐标**。
2. 「我的日程」增加地图视图：把带坐标的任务标在地图上。
3. 地图上方提供**状态筛选**和**工作空间 / 项目筛选**。

---

## Decisions

| Topic | Choice |
|-------|--------|
| 地点存储 | 保留 `items.location` 作为展示名；新增 `location_lat` / `location_lng`（可空，成对出现） |
| 地点输入 | 搜索选定后变成「已定位」chip；纯文本不产生坐标。不允许在 chip 上改字 |
| 无坐标的纯文本地点 | 仍允许（「会议室 A」）；**不**出现在地图上 |
| 地址搜索 | 经 core-service 代理，前端不直连地理编码商 |
| 搜索供应商 | **只使用 Photon**（Komoot 公共实例 `photon.komoot.io`，免 Key）。不做供应商切换，不接腾讯/高德/Nominatim |
| 地图渲染 | 复用现有 MapLibre + OSM 栅格底图（与 `WorkoutRouteMap` 同一套） |
| 日程页形态 | 主栏 **日历 \| 地图** 切换，不是日历日/周/月/年的第五种 mode |
| 地图数据 | 新只读视图 `GET /views/schedule/map`；只返回有坐标的任务 |
| 默认筛选 | 状态：`todo` + `doing`；工作空间 / 项目：全部 |
| 已归档 | 默认不展示，可在状态筛选中打开 |
| 时间窗 | 一期不跟日历月份联动；地图看「当前筛选下所有带坐标任务」 |
| 点击标记 | 打开现有 `TaskDrawerWithComments` |
| iOS / MCP / 计划 | 字段向后兼容；一期不改交互。计划落地任务只拷贝名称，坐标为空 |
| 坐标系 | 库内统一 **WGS-84** |

### Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| 用字符串拼进 `location`（`名称\|lat,lng`） | 破坏现有展示、iOS、MCP、计划导入；无法索引 |
| 改成便签那样的嵌套 `location` 对象并删除字符串 | iOS / MCP / OpenAPI 破坏性变更；便签是 GPS 优先，任务是名称优先 |
| 前端直连 Nominatim / 高德 JS Key | Key 与配额暴露；公共 Nominatim 禁止输入提示式连打；CORS 不稳定 |
| 公共 Nominatim 作为默认搜索 | 使用政策明确不适合 autocomplete；全应用合计 1 次/秒；国内 POI 弱 |
| 高德输入提示作为免费生产方案 | 个人认证基础搜索（含输入提示）月配额约 5,000 次，打字搜索会很快打满 |
| 一期同时做腾讯/高德等国内供应商 | 已确认 Photon 够用；多供应商会引入 Key、GCJ-02 转换和配置分叉 |
| 日程页用地图 SDK（高德/Google）替换 MapLibre | 健康路线图已用 MapLibre+OSM；两套底图与两套坐标会分叉 |
| 把「地图」做成日历第五个 mode | 日历 mode 绑定 `anchor` + 日/周/月/年布局；地图按空间筛选，不是按日期格子 |
| 地图永远堆在日历下方 | 「我的日程」已经是 待办栏 + 日历 + 四象限 + 泳道，再加全高地图不可用 |

---

## 1. 现状

### 任务地点

- 表 `items.location`：`String(500)`，可空，纯文本。
- API：`ItemCreate` / `ItemUpdate` / `ItemOut`、日程视图 `ScheduleTaskItemOut`、任务抽屉 `ItemDetailViewOut` 都只有 `location: str \| None`。
- Web 抽屉（创建与编辑共用 `TaskDrawerWithComments`）是普通 `<input>`，占位「会议室 A、线上、客户现场…」。
- 计划槽位、自然语言草稿、便签转任务、MCP `create_item` / `update_item`、iOS `APIModels` 都把地点当字符串。

### 已有坐标能力（不要混用语义）

| 领域 | 字段 | 语义 |
|------|------|------|
| 便签 | `location_lat/lng/accuracy_m/name/source` | 记录瞬间的 GPS/IP/手工点 |
| 健康训练 | `location_country/admin/city` + 轨迹点 | 城市粒度 + 路线（WGS-84） |
| 任务 | 仅 `location` 文本 | 会议/拜访地点，**没有坐标** |

健康页 `WorkoutRouteMap` 已引入 `maplibre-gl` 与 OSM 栅格样式。日程地图应抽共用底图，不复制第三份初始化逻辑。

### 「我的日程」页面

`codes/web/app/(app)/my/schedule/page.tsx`：

- 左：未排期任务。
- 右：`ScheduleBoard`（日历优先，其下优先级四象限与泳道）。
- `scope=me`，跨用户有权访问的工作空间/项目，已带 `workspace_id/name`、`project_id/name`、`status`。
- **没有**页面级状态或工作空间筛选；日历只按时间窗切。

项目页也嵌了 `ScheduleBoard`，但已锁定单一项目。一期地图只做「我的日程」。

---

## 2. 方案对比

### A. 前端直搜 + 日历下方挂地图

抽屉 debounce 后打 Nominatim；`location` 旁加 lat/lng 列；日程主栏底部再堆一块地图。

- 优点：后端改动小，能最快出原型。
- 缺点：搜索质量（国内）与 ToS/配额都在浏览器；页面纵向过长；和日历时间窗关系不清。

### B. 高德 JS 包圆搜索和地图，地点改为嵌套对象

抽屉用高德输入提示；日程用高德地图 JS API；API 把 `location` 改成 `{ name, lat, lng }`。

- 优点：国内地址体验最好，坐标与底图同为 GCJ-02，钉点不会偏。
- 缺点：破坏现有客户端；浏览器暴露 Key；与健康 MapLibre/WGS-84 分叉；无 Key 的开发环境无法跑。

### C. 名称列保持不变 + 服务端地理编码代理 + MapLibre 地图视图（推荐）

- `location` 继续当名称，新增成对坐标列。
- `GET /geo/places?q=` 鉴权代理，**只转发 Photon**。
- 「我的日程」主栏切到地图视图；筛选在地图正上方。
- 底图继续 MapLibre + OSM，坐标统一 WGS-84。

- 优点：向后兼容；免 Key；与现有健康地图、Views API、任务抽屉同构；坐标与底图都是 WGS-84。
- 代价：国内店名/小区依赖 OSM，可能比高德/腾讯少或旧。一期接受。

**采用 C。**

---

## 3. 数据模型

Alembic：`0035_item_location_coordinates`（`down_revision = 0034_merge_0033_heads`）。

```
items.location            VARCHAR(500)  NULL   -- 展示名，语义不变
items.location_lat        DOUBLE        NULL   -- WGS-84，[-90, 90]
items.location_lng        DOUBLE        NULL   -- WGS-84，[-180, 180]
```

不新增 `place_id`、`accuracy_m`、`location_source`（一期用不到；便签的 source 是 GPS 语义）。

索引：

```sql
CREATE INDEX ix_items_location_coords
  ON items (location_lat, location_lng)
  WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;
```

### 不变量

1. `location_lat` 与 `location_lng` **同时为空或同时有值**。
2. 有坐标时 `location` 必须非空（trim 后长度 1–500）。
3. 仅有名称、无坐标：合法，地图忽略。
4. 清空地点：三个字段一起置空。
5. PATCH 只改 `location` 名称、未带坐标字段：保留原坐标（服务端兼容 iOS/MCP 只改字符串；Web 抽屉在「已定位 chip」场景不会走这条路径）。
6. PATCH `location = null`：同时清坐标，即使请求没带 lat/lng。
7. PATCH 带了一侧坐标、另一侧缺失：`400` `invalid_location_coordinates`。
8. 有坐标但名称为空：`400` `location_name_required`。
9. Web 抽屉保存时始终成组提交：纯文本 → `{ location, lat: null, lng: null }`；chip → 三字段都有；清空 → `{ location: null, lat: null, lng: null }`。这样 Web 不会误走「只改名保留旧坐标」。

重复任务物化副本时，把名称和坐标一起拷到新行。

### API 形状（加法，非破坏）

`ItemCreate` / `ItemUpdate` / `ItemOut` 以及所有嵌了任务的视图（日程、抽屉详情、项目列表）增加：

```python
location: str | None = None          # 已有
location_lat: float | None = None    # Field(default=None, ge=-90, le=90)
location_lng: float | None = None    # Field(default=None, ge=-180, le=180)
```

不引入嵌套 `place` 对象，避免 iOS 解码失败、MCP 工具签名大改。

`ItemUpdate` 用 `model_fields_set`：

| 请求带了什么 | 行为 |
|--------------|------|
| 无 location / lat / lng | 不动 |
| 仅 `location` 字符串（lat/lng 不在 `fields_set`） | 改名，坐标不动（iOS/MCP） |
| `location: null` | 名称 + 坐标全清 |
| `location` + lat + lng 均有值 | 三字段一起写 |
| `location` 有值，且 lat/lng 在 `fields_set` 中为 `null` | 改名并**清坐标**（Web 纯文本保存） |
| 仅 lat + lng | 坐标更新；名称必须已有或本次同时给出 |

活动日志：记名称，可记坐标。地点对项目成员本就可读，与任务正文同级。

---

## 4. 地址搜索

### 4.1 后端代理

```
GET /geo/places?q={query}&limit=8
Authorization: 与其它 API 相同（登录用户）
```

- `q`：1–200 字，trim；短于 2 个字符返回空列表（不打供应商）。
- `limit`：1–10，默认 8。
- 每用户约 1 次/秒（内存或 Redis 均可；一期进程内令牌桶即可）。
- 超时 3s；供应商 4xx/5xx → `502 geo_provider_error`。
- 不写活动日志（搜索不是业务资源变更）。

响应：

```json
{
  "items": [
    {
      "name": "星巴克（中关村大街店）",
      "address": "北京市海淀区中关村大街 1 号",
      "lat": 39.9836,
      "lng": 116.3168
    }
  ]
}
```

`name` 写入 `items.location`（若 `name` 超过 500 则截断）。`address` 仅展示在下拉副标题，不入库。`lat`/`lng` 已是 WGS-84。

### 4.2 供应商：只接 Photon

已确认：**一期只使用 Photon**，不做供应商抽象切换。

任务抽屉是 debounce 输入提示（≥2 字、300ms）。Photon 就是为 typeahead 做的，公共实例免 Key，返回 WGS-84，和 OSM 底图一致。公共 Nominatim 禁止这种连打，不采用。

调用：

```
GET https://photon.komoot.io/api?q={query}&limit={limit}&lang=zh
```

- 响应 GeoJSON；`properties.name` / `properties.street`+`city` 等拼 `name` 与 `address`；`geometry.coordinates` 为 `[lng, lat]`。
- 必须带可识别的 `User-Agent`（默认 `Timia/core-service`，可配置覆盖）。
- 公共实例要求用量合理；过猛会被限流。服务端已有每用户约 1 次/秒。
- 限流或上游失败：`502 geo_provider_error`，文案「地点搜索暂时不可用」，不打断纯文本保存。

`Settings`：

| 配置 | 含义 |
|------|------|
| `photon_base_url` | 默认 `https://photon.komoot.io` |
| `photon_user_agent` | 默认 `Timia/core-service` |

不设 `geocoder_provider`，不接腾讯/高德 Key，不做 GCJ-02 转换。前端只打 `/geo/places`。

底图继续用 OSM 栅格（健康路线图已在用，需 © OpenStreetMap）。

其它免费供应商（腾讯、高德、Geoapify、公共 Nominatim 等）只作背景对比，**不实现**。公共实例长期不稳时，后续可改为自建 Photon（同一协议，只改 `photon_base_url`）。

### 4.3 抽屉交互

替换 `TaskDrawerWithComments` 里地点 `<input>`，抽 `PlaceSearchField`（创建/编辑同一套）。

```
地点（未选定 POI，可当纯文本）
┌─────────────────────────────────────────┐
│ 🔍 搜索地址或输入名称                    │
└─────────────────────────────────────────┘
  ┌ 星巴克（中关村大街店）              ┐
  │ 北京市海淀区中关村大街 1 号         │
  └─────────────────────────────────────┘

地点（已从搜索结果选定）
┌─────────────────────────────────────────┐
│ 📍 星巴克（中关村大街店）          [×]  │  ← chip，已定位
└─────────────────────────────────────────┘
```

行为：

1. 输入 ≥ 2 字，debounce 300ms，请求 `/geo/places`。
2. 点选一条：输入框收成 chip（名称 + 已定位），写入名称 + 坐标，下拉关闭。
3. 只打字、不点选就保存：只存名称，坐标为 `null`（线上、会议室）。chip 不出现。
4. 已是 chip 时，点 × 或 Backspace：清名称和坐标，回到空输入。不允许在 chip 上直接改字（避免「线上」仍挂着咖啡馆坐标）。
5. 换地点：先 ×，再搜并另选。
6. 加载失败：下拉内一行错误，不打断保存。
7. 无结果：「未找到该地址」。
8. 键盘：Arrow / Enter / Esc，与 `SystemSelect` 一致。
9. 编辑已有任务：有坐标则回填为 chip；仅有名称则回填为普通文本。
10. 一期不做抽屉内小地图、不做「使用当前定位」、不做 chip 内改显示名。

文案走 `next-intl`（`messages/zh.json` + `en.json`）。默认中文。

其它入口（计划槽、自然语言、便签转任务）一期仍是纯文本；落到 item 后没有坐标，地图上不出现，直到用户在抽屉里搜一次。

---

## 5. 「我的日程」地图视图

### 5.1 页面结构

右栏顶部增加与日历工具条视觉同级的分段控件：**日历 | 地图**。

- **日历**：现状不变（日/周/月/年 + 四象限 + 泳道）。
- **地图**：右栏只渲染地图工作区（筛选条 + 画布）。左栏未排期列表保留。
- 切换不丢日历 `view`/`anchor`。刷新后默认仍是日历（不必 persist；若实现成本低可用 `sessionStorage` 键 `timia.schedule.boardMode`）。

项目页一期不加该开关。

### 5.2 地图工作区布局

地图画布上方（不是悬浮在瓦片上挡住操作，除非窄屏）放筛选条：

```
[日历] [地图]
┌──────────────────────────────────────────────────────────┐
│ 状态  (未开始) (进行中) (已完成) (已归档)                 │
│ 范围  [工作空间 ▾ 全部]  [项目 ▾ 全部]     n 个地点      │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                      MapLibre 画布                        │
│                         •  •                             │
│                            •                             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- 状态：多选 chip。选中 `bg-primary/10` + 主色描边。至少保留一个；取消最后一个时忽略点击。
- 工作空间 / 项目：可搜索下拉，选项来自现有 `GET /workspaces`、`GET /workspaces/{id}/projects`，额外「全部」。
- 级联：改工作空间则项目回到「全部」，并重新拉项目列表。工作空间为「全部」时项目禁用且为「全部」。
- 计数：「n 个地点」= 当前结果条数；若 `truncated` 则「前 n 个地点」。

筛选只影响地图请求，不影响日历/四象限/泳道。

### 5.3 标记与交互

- 只渲染 `location_lat`/`location_lng` 都有的任务。
- 钉点颜色：优先任务 `color`（`#FFFFFF` 时回退优先级色，与日历卡片一致）；状态用小图标或描边区分（对齐 `TaskStatusIcon`）。
- MapLibre `cluster: true`。聚合点显示数量；点击先 `easeTo` 展开，到最大缩放仍聚合则弹出列表。
- 同一坐标多任务：popup 列表（标题、时间、工作空间/项目、状态），点一行打开抽屉。
- 单任务点击：直接打开现有抽屉，不新做详情卡。
- 打开抽屉后保存/删除地点：`refreshNonce` 刷新地图。
- `fitBounds` 包住当前结果，padding 40，单点 zoom 14，空结果不飞。
- 空结果：底图仍在，居中中国大致范围（约 `lng=105, lat=35, zoom=4`），叠加 `text-text-secondary` 文案：
  - 用户名下没有任何带坐标任务：「还没有带地点的任务。添加任务时搜索并选择地址，就会出现在这里。」
  - 被筛选滤光：「没有符合筛选条件的地点任务。」
- 加载：画布 `opacity-70` + `aria-busy`，与日历切月一致。
- 错误：筛选条下 `text-error`，可重试。
- 不在地图上拖钉改坐标（一期只读展示）。
- 窄屏：筛选条折行；地图最小高度约 60vh。

底图：从 `WorkoutRouteMap` 抽出共享 `osmRasterStyle()`（或 `lib/map/osmStyle.ts`），健康路线图改为引用它。Attribution 保持 © OpenStreetMap。

---

## 6. 地图 Views API

与其它日程视图一样：`routes/views/schedule.py` 只做鉴权与错误映射，查询在 `services/views/`。

```
GET /views/schedule/map
  scope=me                          # 一期只实现 me；project 回 400 map_scope_unsupported
  status=todo&status=doing          # 可重复；缺省 todo,doing
  workspace_id?                     # 可选 UUID
  project_id?                       # 必须伴随 workspace_id
  limit=500                         # 1–500，默认 500
```

权限：与 `list_schedule_items(..., kind="me")` 相同（参与者/负责人，工作空间 owner 或项目 active member）。再叠加：

- `location_lat IS NOT NULL AND location_lng IS NOT NULL`
- `status IN (...)`
- 可选 workspace / project

排序：`start_at DESC NULLS LAST`，再 `updated_at DESC`。超出 `limit` 时 `truncated=true`，不提供分页（地图不适合无限滚；超限提示用户收窄筛选）。

```python
class ScheduleMapItemOut(ScheduleTaskItemOut):
    location_lat: float
    location_lng: float

class ScheduleMapViewOut(BaseModel):
    items: list[ScheduleMapItemOut]
    total: int          # 截断前匹配数
    truncated: bool
```

`ScheduleTaskItemOut` 本身也带上可空的 lat/lng，日历卡片将来若要显示「已定位」不必再改协议；日历布局计算不使用它们。

非法 `status`、只有 `project_id` 没有 `workspace_id`：`400`。

---

## 7. 前端模块边界

| 单元 | 职责 | 依赖 |
|------|------|------|
| `PlaceSearchField` | 搜索 combobox + 已定位 chip；输出 `{ name, lat, lng } \| { name, lat:null, lng:null } \| null` | `GET /geo/places` |
| `lib/api/geo.ts` | 搜索客户端 | `apiFetch` |
| `lib/api/schedule-views.ts` | `fetchScheduleMap` | 现有 scope helper |
| `ScheduleMapView` | 筛选条 + 画布 + 空/错/加载 | map fetch、workspace/project 列表 |
| `ScheduleMapCanvas` | MapLibre 生命周期、cluster、popup、fitBounds | 共享 OSM style |
| `lib/map/osmStyle.ts` | 栅格 style 单源 | `maplibre-gl` |
| `my/schedule/page.tsx` | `boardMode` 状态，日历 vs 地图 | 现有抽屉 |

`ScheduleBoard` 不塞地图 props。页面在日历模式渲染 `ScheduleBoard`，地图模式渲染 `ScheduleMapView`。任务抽屉仍由页面持有，地图 `onItemClick` 复用 `openDrawer`。

`TaskDrawerWithComments` 提交体增加 `location_lat` / `location_lng`；本地 state 从「一个 string」变为名称 + 可选坐标。编辑回填用详情接口里的新字段。

---

## 8. 错误码与配置

| HTTP | detail | 场景 |
|------|--------|------|
| 400 | `location_too_long` | 已有，名称 > 500 |
| 400 | `invalid_location_coordinates` | lat/lng 不成对或越界 |
| 400 | `location_name_required` | 有坐标无名 |
| 400 | `invalid_status` | 地图视图 status 非法 |
| 400 | `map_scope_unsupported` | `scope=project` |
| 200 | `{ items: [] }` | 搜索 `q` 短于 2 个字符，或供应商无结果；不当作错误 |
| 401 | — | 未登录 |
| 429 | `geo_rate_limited` | 搜索过快 |
| 502 | `geo_provider_error` | Photon 超时、限流或 4xx/5xx |

`core/config.py` 只读环境变量。Photon 免 Key，不要把第三方搜索 URL 写进前端。

---

## 9. 权限与隐私

- 读写坐标与读写任务相同：能 PATCH 该 item 就能改地点。
- `/geo/places` 任意登录用户可调，不返回其它用户的任务。
- 地图视图只用 `list_schedule_items` 的可见集，不会看到无权限项目。
- 前端不把查询打到 Photon；`User-Agent` 只存在服务端。

---

## 10. 测试

### core-service

- 不变量：成对坐标、清名称即清坐标、只改名保留坐标、越界 400。
- 重复任务副本带上 lat/lng。
- `GET /views/schedule/map`：无坐标任务被排除；status / workspace / project 过滤；默认不含 archived；超 limit 时 `truncated`；无权限项目不出现；未登录 401。
- `/geo/places`：q 短于 2 返回空；用假 Photon 响应测 name/address/lat/lng 映射；未登录 401。不测真实 photon.komoot.io。

### web

- `PlaceSearchField`：选中、只打字、清空、debounce（fake timer）。
- 地图筛选：状态至少一项；工作空间「全部」时项目禁用；级联重置。
- 抽屉保存 payload 含 lat/lng 或显式 null。

地理编码与 MapLibre 不写 E2E（无浏览器地图工具时用组件测试 + 类型）。

实现后：`cd codes/core-service && uv run pytest -q`、相关 web 测试、`make codegen`。

---

## 11. 实现顺序（供后续排期，本期不写代码）

1. Migration + schema + item 写路径不变量 + 测试。
2. `GET /geo/places` + Photon adapter + 测试。
3. `PlaceSearchField` 接入任务抽屉；`make codegen`。
4. `GET /views/schedule/map` + 测试。
5. 抽出 OSM style；`ScheduleMapView`；「我的日程」日历/地图切换。

每一步都可独立合并、可手工验收。

---

## 12. 后续（明确不做）

- iOS 编辑器搜索与 iOS 地图。
- 计划槽位坐标；计划 apply 时自动 geocode。
- 自然语言地点自动 geocode。
- 日历卡片上的「已定位」小图标。
- 地图上点空白创建任务、拖钉改坐标。
- 按日历当前月过滤地图。
- 项目页地图（筛选已锁死单项目，复用 `ScheduleMapView` 即可，不在本期）。
- MCP tools 增加 lat/lng 参数（OpenAPI 加法后旧 tool 仍可用；需要时再扩签名）。
- 腾讯 / 高德 / Nominatim 等其它搜索供应商；GCJ-02 转换。公共 Photon 不稳时只考虑自建 Photon（改 `photon_base_url`）。

---

## 13. 验收标准

1. 创建任务时搜索并选择地址，保存后详情含名称和坐标。
2. 只输入「线上」不选择搜索结果，保存后有名称、无坐标，地图没有该任务。
3. 清空地点后再保存，名称和坐标都空，地图上消失。
4. 「我的日程」切到地图，能看到已定位任务钉点；点钉打开原抽屉。
5. 状态 chip、工作空间、项目筛选立即改钉点集合；空态文案正确。
6. 未登录无法搜地址、无法拉地图视图。
7. iOS / MCP 仍只读写 `location` 字符串，不崩溃（忽略未知字段）。
