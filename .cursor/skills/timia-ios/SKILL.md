---
name: timia-ios
description: Use when implementing or changing the Timia iOS SwiftUI app under codes/mobile/ios, XcodeGen, HealthKit sync, Live Activities, Keychain auth, or iOS calendar/task/sticky-note UI.
---

# Timia iOS

原生 SwiftUI，iOS 17+，Swift 6。工程由 **XcodeGen** 生成：改 `project.yml` 后 `xcodegen generate`，不要手改 `.xcodeproj`。

```bash
cd codes/mobile/ios
xcodegen generate
# 验证：xcodebuild … CODE_SIGNING_ALLOWED=NO build（见 ios README）
```

## 结构

| 目录 | 用途 |
|------|------|
| `Timia/App` | `TimiaApp`、`AppSession`、`MainTabView` |
| `Timia/Core/API` | `APIClient` + `APIModels`（`convertFromSnakeCase`） |
| `Timia/Core/Auth` | Keychain；**移动端 challenge 会话**，不是 Web JWT |
| `Timia/Core/Health` | HealthKit 同步（仅 iOS） |
| `Timia/Features/*` | 界面：Schedule / Tasks / Workspaces / StickyNotes / Health / Account |
| `TimiaWidget` | Live Activity |
| `TimiaTests` | 几何/同步/模型单测 |

Debug API：`Config/Debug.xcconfig`（本地 Docker nginx `http://127.0.0.1:8080/core-service`）。真机/同一局域网把主机换成 Mac 的 LAN IP，端口保持 **8080** 且带 `/core-service` 前缀；URL 里的 `//` 写成 `/$()/`。Release：`https://timia.online/core-service`。

## 约束

- 颜色/表面用 `TimiaTheme`，状态色用 `TaskStatusPalette`
- 新网络调用走 `APIClient.request`，模型放 `APIModels.swift`
- **不要**做数据分析（Web `/my/analytics` 专属）
- **不要**把 HealthKit `/health/sync/*` 暴露给 MCP
- Widget 与 App 共享的 Live Activity 类型放在 `Core/ScreenNotification/`，并列入 `project.yml` 两边 sources
- 主 Tab 是日程；工作空间/账户是 `navigationDestination`，不是额外 Tab
- 日历周从周日开始；规划（Plans）不在 iOS 范围
- 健康同步只走 `Core/Health` + `/health/sync/*`，Web 图表读的是 views 汇总
