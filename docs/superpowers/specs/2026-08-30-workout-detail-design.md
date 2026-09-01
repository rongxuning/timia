# 运动记录详情设计

**Date:** 2026-08-30  
**Branch:** `feature/health`  
**Depends on:** [2026-08-27-health-domain-design.md](./2026-08-27-health-domain-design.md)  
**Scope:** Web「近期训练」点进单次训练详情；GPS 路线与地图、公里分段、配速与跑步动力学曲线；即时跑力（指数 + 约合瓦特）；训练负荷（区间加权、Banister TRIMP、rTSS）；基础信息同一行增加最大心率。  
**Out of scope:** 选择课表与课表目标；RQ 分析图表；训练补给；装备与跑鞋里程；训练心得与分享二维码；Android；watchOS 直播会话。

参考视觉来自 RQrun 一次户外跑详情。产品对齐其信息架构，不复刻其私有账号与课表。数据源仍是 Apple HealthKit。数值量级可接近截图，不保证等于 33.8 / 11.9。

## Goal

用户从健康页打开一条训练，看到地图轨迹、3×3 摘要（含即时跑力与三种负荷口径）、公里分段表，以及配速、心率、步频、步幅、功率、垂直振幅、触地时间、海拔曲线。算不出的格子和曲线为「—」或不渲染，不用 0 冒充。公式在「？」里用简体中文写明。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 即时跑力 | Polar \(RI_0/x\)，一位小数；有体重时另算约合功率（瓦），写在跑力数字下方 |
| 训练负荷（宫格） | 心率五区加权分钟，权重 0.20–1.00，一位小数 |
| Banister TRIMP | 详情另列，有心率序列则按点累加，否则场均 |
| rTSS | 详情另列；阈值配速由即时跑力反推 Daniels T 配速；无跑力则「—」 |
| 跑力适用类型 | 仅 `running` |
| 区间负荷 / TRIMP | 有时长且有心率的训练 |
| 最大心率 | 基础信息用户填写优先；空则 Tanaka `208 − 0.7 × 年龄`；两者都空则跑力与三种负荷皆「—」 |
| 静息心率 | 近 14 天日汇总 `resting_hr_bpm` 最近一条；没有则区间负荷与 TRIMP 用 %HRmax |
| 地图 | MapLibre GL；路线 GeoJSON；公里点与起终点标记 |
| 曲线 | 有序列才渲染；X 轴相对开始时间；折线 1px |
| 文案 | 用户可见中文一律简体；注明估算、非医疗 |

---

## 1. 产品流程

### 1.1 入口

健康页「近期训练」每张卡片可点，进入 `/my/health/workouts/{id}`，查询串仅用于返回健康页。

面包屑：健康 / 训练详情。无效 id 或非本人：404，文案「找不到这条训练」。

### 1.2 页面结构（自上而下）

左侧栏不变。右侧本次训练：

1. **地图：** 有路线则满宽地图（圆角卡片）。轨迹按配速分段上色（快偏绿、慢偏蓝灰）；起点、终点、整公里数字点。无路线则整块不渲染。
2. **身份行：** 类型中文名、`YYYY年M月D日 星期X HH:mm`、天气、地点。
3. **摘要宫格：** §3。即时跑力、训练负荷旁「？」。宫格下方一行辅指标：`TRIMP n · rTSS n`（缺则该段省略），点「？」看三种负荷口径。
4. **分段信息：** 有公里分段则表；无则整块不渲染。
5. **曲线：** §8 列出的模块，无数据的模块不渲染。
6. **分析与建议：** 虚线占位，文案「将根据该次训练的原始数据生成观察与建议，稍后接入。」

---

## 2. 基础信息（最大心率，同一行）

`health_profiles` 增加可空 `max_hr_bpm`（整数，80–220）。PATCH `/health/profile` 与视图 `profile` 一并读写。

侧栏「基础信息」**一行内**（`flex-nowrap items-stretch`），禁止折成两行：

| 控件 | 展示 |
|------|------|
| 男 / 女 | 现有 `w-8` 按钮 |
| 年龄 | 框内单位「岁」，直接输入，无步进器 |
| 身高 | 框内单位「厘米」 |
| 最大心率 | 框内单位「次」，placeholder「心率」，1–3 位数字 |

输入仍为 `type="text"` + `inputMode="numeric"`，数值完整可见。侧栏 260px 时靠压缩左右内边距和 `min-w-0` 挤进同一行，不换行。

副标题改为：`用于推算消耗、跑力与负荷`。

保存时四项一起提交。最大心率清空则存 `null`，计算回退 Tanaka。

---

## 3. 摘要宫格

固定 3×3，缺值「—」。大数字本身不带单位（跑力指数、负荷无单位）；功率瓦特写在跑力下方小字。

| 位置 | 标签 | 值 | 来源 |
|------|------|----|------|
| 左上 | 即时跑力 | `33.8` 下一行 `约 240 瓦` | §5；非跑步无跑力；无体重且无手表功率则不写瓦特行 |
| 中上 | 距离 | `5.01` | `distance_m / 1000`，标签含「公里」 |
| 右上 | 平均配速 | `7'01"` | `avg_pace_sec_per_km`，否则距离/时长 |
| 左中 | 训练负荷 | `11.9` | §6 区间加权 |
| 中中 | 总时长 | `00:35:08` | `duration_seconds` |
| 右中 | 平均心率 | `161` | `avg_hr_bpm`，标签含「次/分」 |
| 左下 | 累计爬升 | 整数 | `elevation_ascended_m`，否则路线海拔累加上升段 |
| 中下 | 平均步幅 | 两位小数 | 手表 `running_stride` 场均，否则 `distance_m / (步频 × 分钟)` |
| 右下 | 平均步频 | 整数 | `avg_cadence_spm` |

瓦特优先级：训练窗内 `running_power` 平均 → 否则 `1.06 × 体重kg × 速度m/s`（平路估算，体重取近 14 天最后一次 `body_mass`）。即时跑力指数与瓦特同时展示，**不把指数改写成瓦特**。

---

## 4. 计算用心率

| 输入 | 取值 |
|------|------|
| \(HR_{max}\) | 1) `health_profiles.max_hr_bpm` 2) Tanaka `208 − 0.7 × age_years` 3) 皆无 → 跑力、区间负荷、TRIMP、rTSS 均为 `null` |
| \(HR_{rest}\) | 近 14 天 `resting_hr_bpm` 最近一条 |
| \(HR\) | `avg_hr_bpm` 或序列点 |

`hr_max_used` / `hr_rest_used` 随详情返回，便于核对。填写最大心率后，无年龄也能算跑力。

---

## 5. 即时跑力

仅 `running`。不满足则 `null`：用时 < 12 分钟；距离 < 1000 m 或均速 < 6 km/h；无平均心率；无 \(HR_{max}\)；\(x < 0.05\)。

\[
RI_0 = \frac{213.9}{t}\left(\frac{d}{1000}\right)^{1.06} + 3.5,\quad
x = \mathrm{clamp}(HR / HR_{max} \times 1.45 - 0.30,\; 0,\; 1)
\]

跑力 \(= RI_0 / x\)，夹到 20–85，一位小数。有路线海拔时，对均速做坡度修正：用路线平均坡度 \(grade\) 把 ACSM 平路耗氧换成含坡项后再映射到等效平路速度，再代入 \(RI_0\)（无路线则当平路）。

「？」：根据本次配速与心率估算有氧跑力；约合瓦特来自手表跑步功率或体重×速度。不能替代实验室测试。

---

## 6. 训练负荷（三种口径）

**宫格「训练负荷」= 区间加权分钟**（与截图 5–15 / 30–50 量级一致）。

有静息用 %HRR，否则 %HRmax。有心率序列则按点落入五区累加分钟；否则场均落在一个区。

| 区 | %HRR | 无静息 %HRmax | 每分钟权重 |
|----|------|---------------|------------|
| 1 | < 0.50 | < 0.60 | 0.20 |
| 2 | 0.50–0.65 | 0.60–0.70 | 0.35 |
| 3 | 0.65–0.80 | 0.70–0.80 | 0.55 |
| 4 | 0.80–0.90 | 0.80–0.90 | 0.75 |
| 5 | ≥ 0.90 | ≥ 0.90 | 1.00 |

负荷 \(= \sum t_i w_i\)，一位小数，0–200。

**Banister TRIMP**（详情辅行，不进宫格）：

\[
\mathrm{TRIMP}=\sum \Delta t_{\min}\cdot HRR \cdot 0.64 \cdot e^{k\cdot HRR}
\]

\(k\)：男 1.92，女 1.67，未填性别 1.80。无序列则 \(\Delta t\) 取整场分钟、\(HRR\) 用场均。一位小数。

**rTSS**（跑步；非跑步「—」）：

Daniels 氧耗 \(VO_2=-4.60+0.182258v+0.000104v^2\)（\(v\) 为 m/min）。把即时跑力当作 VDOT，T 强度取 88% VDOT，反解速度得阈值配速 \(P_T\)（秒/公里）。

\[
IF = P_T / P_{avg},\quad rTSS = (t/60)\cdot IF^2 \cdot 100
\]

\(P_{avg}\) 为场均配速。无跑力或无配速则 `null`。一位小数。

「？」同时写清：宫格是区间加权；TRIMP 是 Banister 指数加权心率；rTSS 是相对阈值配速的压力分，1 小时阈值配速约为 100。

---

## 7. GPS 路线、地图、分段

### 7.1 同步

新表 `health_workout_route`：`owner_user_id` + `workout_hk_uuid` 唯一；`points` JSONB 为 `[{t, lat, lng, alt}]`，`t` 为相对训练开始的秒；`point_count`。

`POST /health/sync/workout-routes`，一批 ≤ 10 条，每条 ≤ 1800 点。按 `hk_uuid` 关联已有 `health_workout_session`；会话尚未到达则 400 `workout_not_found`（iOS 先同步训练再同步路线）。

iOS：已申请 `HKSeriesType.workoutRoute()`。导出全轨迹，按时间均匀降到最多 1800 点；海拔有则带上。`elevation_ascended_m` / `elevation_descended_m` 仍从训练 metadata 写入会话（可空列）。

删除训练时级联删路线。

### 7.2 地图

详情把点编成 GeoJSON `LineString`。Web：MapLibre GL，容器高度约 16rem；`NEXT_PUBLIC_MAP_STYLE_URL` 可配底图，缺省 OSM 栅格。公里点：沿累计球面距离每 1000 m 一个；起终点用现有主色/红色区分。无 API key 时仍能画线。

### 7.3 公里分段表

服务端按路线累计距离切 1.00 km，最后不足 1 km 单独一行，底行「总计」。

| 列 | 规则 |
|----|------|
| 圈数 | 1…n，最后一行「总计」 |
| 时间 | 该段用时 `mm:ss`，总计 `hh:mm:ss` |
| 距离 | 公里，两位小数 |
| 平均配速 | 该段用时/距离 |
| 平均心率 | 落入该段时间窗的心率平均 |
| 平均步频 | 该段步频序列平均；没有则「—」 |

无路线但有距离时间序列时，用距离样本切段；都没有则不渲染表。

---

## 8. 曲线

时间轴：相对开始，`mm:ss`。点上限每条序列 600（服务端均匀降采样，保留首尾）。Y 轴 `text-caption`，配速轴越上越快。

| 模块 | 序列来源 | 标题旁 |
|------|----------|--------|
| 配速 | `running_speed`（m/s→配速）；否则相邻路线点距离/时间 | 平均、最佳（最快） |
| 配速区间 | 相对即时跑力的 E/M/T/I/R 配速带；无跑力则相对场均±档 | 可展开：区名、配速范围、停留、占比 |
| 心率 | 已有 `heart_rate` | 平均、最大 |
| 心率区间 | 与 §6 五区相同 | 可展开 |
| 步频 | 训练窗 `step_count` 折算，或会话统计 | 平均、最大 |
| 步幅 | `running_stride` | 平均、最大 |
| 功率 | `running_power`（瓦） | 平均、最大 |
| 垂直振幅 | `running_vertical_oscillation`（毫米） | 平均、最大 |
| 触地时间 | `running_ground_contact`（毫秒） | 平均、最大 |
| 海拔 | 路线 `alt`；总爬升/总下降写在标题旁 | 总爬升、总下降 |

HealthKit 新增数量类型（写入现有 `health_sample_quantity`，`metric_type` ≤ 32 字符）：

`running_speed`、`running_stride`、`running_power`、`running_vertical_oscillation`、`running_ground_contact`。

iOS 授权补：`runningStrideLength`、`runningPower`、`runningVerticalOscillation`、`runningGroundContactTime`（已有 `runningSpeed`）。单位：m/s、m、W、cm 存成 mm、s 存成 ms。手表没有的动力学不出曲线。

---

## 9. API

`GET /views/me/health/workouts/{workout_id}` → `HealthWorkoutDetailOut`（列表接口不改、不带跑力/负荷/路线）。

在现有训练字段之外：

```
elevation_ascended_m, elevation_descended_m
stride_m
running_index, running_power_w          # 指数；约合或手表瓦特
training_load, trimp, rtss
hr_max_used, hr_rest_used
running_index_formula, training_load_formula   # HealthScoreFormulaOut
route: { points, km_markers: [{ km, lat, lng }] } | null
splits: [{ lap, duration_seconds, distance_m, pace_sec_per_km, avg_hr_bpm, avg_cadence_spm }] | null
heart_rate, heart_rate_zones
series: {
  pace, cadence, stride, power, vertical_oscillation, ground_contact, altitude
}  # 各为 { points: [{ offset_seconds, value }], avg, max } | null
pace_zones: [{ zone, lo, hi, seconds, ratio }] | null
```

同步：

- 训练 payload 增加 `elevation_ascended_m`、`elevation_descended_m`
- `POST /health/sync/workout-routes`
- 数量样本允许 §8 的新 `metric_type`

错误：401；详情 404；路线批次 `batch_too_large` / `too_many_points` / `workout_not_found`。之后 `make codegen`。

纯函数：`app/services/workout_metrics.py`（跑力、三种负荷、分段、坡度）。视图：`services/views/workout_detail.py`。单测：跑力时长边界、步行无跑力、无心率无负荷、Banister 性别系数、无跑力无 rTSS、1 km 切段含不足 1 km 的末圈。

---

## 10. Web

- 路由 `app/(app)/my/health/workouts/[id]/page.tsx` + `HealthPageFrame`
- 列表整卡可点
- 地图仅详情使用 MapLibre，不引入到其它页
- 曲线对齐健康详情趋势图（1px、HTML 轴文字）
- `api-catalog.ts` 登记详情与路线同步
- 基础信息同一行含最大心率（§2）

---

## 11. 明确不做

1. 选择课表、课表目标灰区  
2. 「查看 RQ 分析图表」  
3. 训练补给记录  
4. 我的装备 / 跑鞋里程  
5. 训练心得、分享二维码  

不把宫格里的即时跑力指数替换成瓦特；瓦特是跑力下方的约合值或手表功率曲线。
