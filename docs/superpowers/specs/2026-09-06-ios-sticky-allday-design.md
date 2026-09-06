# iOS 日/周全天栏固定展示

## 目标

日、周模式下，全天任务栏固定在日期栏正下方；时间轴竖向滚动时不跟着滚走。切换可见日/周时，固定栏内容随之更新。

## 范围

- **只改 iOS**（`ScheduleHomeView.swift` 日/周）
- 不改 Web、月/年、拖拽改期等能力

## 方案

从 `DayTimelineSection` / `WeekTimelineSection` 抽出 `AllDayRow` / `WeekAllDayRow`，放到 `DateStrip` / `PagedWeekHeader` 与竖向 `ScrollView` 之间。

| 模式 | 数据源 |
|------|--------|
| 日 | `daysByAnchor[dayKey(selectedDate)]` 中全天任务 |
| 周 | `weeksByAnchor[weekKey(selectedDate)]` 的 segments |

可见日/周仍由现有 `onVisibleDate` / `onVisibleWeek`、点选、周头横滑驱动 `selectedDate`，固定栏只读该状态。

Section 内保留日期/周标签与小时网格，去掉内嵌全天行。

## 非目标

- Web 对齐拖拽/完成交互
- 改导航模型（仍为竖向无限日/周列表）
- 空态文案与 Web 统一
