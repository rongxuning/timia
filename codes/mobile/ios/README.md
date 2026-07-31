# Timia iOS

原生 SwiftUI 客户端，最低支持 iOS 17。

## 环境

- Xcode 26 或更高版本
- Swift 6
- XcodeGen（本机可通过 `brew install xcodegen` 安装）
- 本地 Timia API，默认地址 `http://127.0.0.1:8000`

## 生成与运行

```bash
cd codes/mobile/ios
xcodegen generate
open Timia.xcodeproj
```

在 Xcode 中选择一个 iPhone Simulator，运行 `Timia` Scheme。

Debug API 地址在 `Config/Debug.xcconfig` 中配置。真机调试时将 `127.0.0.1` 改为 Mac 的局域网地址。Release 默认使用 `https://timia.online/core-service`。

## 连接真机调试

`127.0.0.1` 始终表示当前设备自身：在 iPhone 真机上它指向 iPhone，而不是运行后端的 Mac。因此，真机调试时需要让 iPhone 通过局域网访问 Mac。

### 1. 连接并配置 iPhone

1. 让 Mac 和 iPhone 连接同一个 Wi-Fi。
2. 使用数据线连接 iPhone，并在 iPhone 上选择“信任此电脑”。
3. 在 Xcode 中打开 `Window > Devices and Simulators`，确认设备已经出现。
4. 如果系统要求，在 iPhone 的“设置 > 隐私与安全性 > 开发者模式”中开启开发者模式并重启设备。
5. 在 Xcode 的 Timia Target 中打开 `Signing & Capabilities`，勾选 `Automatically manage signing` 并选择自己的 Apple Developer Team。

### 2. 获取 Mac 的局域网 IP

在 Mac 终端执行：

```bash
ipconfig getifaddr en0
```

例如返回 `192.168.1.23`。如果命令没有输出，可在“系统设置 > Wi-Fi > 当前网络 > 详细信息 > TCP/IP”中查看 IP 地址。

### 3. 修改 Debug API 地址

编辑 `Config/Debug.xcconfig`，将 `127.0.0.1` 替换为刚才查到的 Mac 局域网 IP：

```text
TIMIA_API_BASE_URL = http:/$()/192.168.1.23:8000
```

`$()` 用于避免 Xcode 将 URL 中的 `//` 解析为配置文件注释，请勿删除。

### 4. 启动允许局域网访问的后端

先启动数据库：

```bash
cd /Users/rongxuning/Documents/timia
make db
```

然后启动监听所有本机网络接口的 API：

```bash
cd /Users/rongxuning/Documents/timia/codes/core-service
PYTHONPATH=. uv run python -m alembic upgrade head
PYTHONPATH=. uv run python -m uvicorn app.main:app \
  --reload \
  --host 0.0.0.0 \
  --port 8000
```

保持该终端运行。macOS 防火墙首次询问时，需要允许 Python 或 uvicorn 接收传入连接。

### 5. 验证网络连接

先在 iPhone 的 Safari 中访问以下地址，其中 IP 替换为 Mac 的实际局域网 IP：

```text
http://192.168.1.23:8000/health
```

看到包含 `"ok"` 的响应后，说明真机能够访问本地 API。

### 6. 从 Xcode 运行

1. 在 Xcode 顶部 Scheme 中选择 `Timia`。
2. 将运行设备切换为已连接的 iPhone。
3. 按 `Command + R` 编译、安装并启动 App。
4. 如果 iPhone 提示开发者不受信任，按照系统提示在“设置 > 通用 > VPN 与设备管理”中信任对应开发者。

调试完成并切回模拟器时，将 `Config/Debug.xcconfig` 恢复为：

```text
TIMIA_API_BASE_URL = http:/$()/127.0.0.1:8000
```

Mac 的局域网 IP 可能在重新连接 Wi-Fi 后变化。如果真机突然无法连接 API，应先重新检查 IP 地址和 `/health` 页面。

## 当前实现

- 邮箱注册、登录、Keychain Token、401 自动退出
- 我的日程统计、日/周/月原生日历、日期导航、泳道和优先级视图
- 任务创建、编辑、删除、评论
- 工作空间列表、创建、编辑、删除、收藏与回滚
- 项目列表、创建、编辑、删除及项目任务
- 账户信息与退出登录
- 系统管理员成员目录与成员归属详情
- 工作空间/项目成员添加、角色调整、移除与只读权限
- 工作空间活动时间线、最近讨论筛选、分页、完成状态和删除

数据分析不进入 iOS 范围。

## 命令行验证

```bash
cd codes/mobile/ios
xcodegen generate
xcodebuild -project Timia.xcodeproj -scheme Timia \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/timia-ios-derived CODE_SIGNING_ALLOWED=NO build
```
