# iOS TestFlight

Push to `main` that touches `codes/mobile/ios/**` runs `.github/workflows/ios-testflight.yml` on `macos-latest`. It archives scheme `Timia` (iPhone app + embedded TimiaWidget) and uploads to TestFlight. `workflow_dispatch` can run it by hand. One upload at a time; an upload already in progress is not cancelled. Editing only the workflow file does not auto-trigger (`paths` is `codes/mobile/ios/**`).

推到 `main` 且改动 `codes/mobile/ios/**` 时，同一工作流会归档 scheme `Timia`（iPhone，并嵌入 TimiaWidget）并上传 TestFlight。Actions 里也可以手动 Run workflow。同一时间只跑一个上传，不会取消已经开始的那次。只改工作流文件不会自动触发。没有 Watch target，服务器部署仍走 `.github/workflows/deploy.yml`，这条流水线不调用它。

## First run / 第一次运行

The repo has no certificate and no API key. Before the first successful upload, a repo admin sets the secrets below (GitHub → Settings → Secrets and variables → Actions). If any required secret is missing, the workflow exits before signing and does not print secret values.

仓库里没有证书和 API 密钥。**第一次成功上传之前，需要仓库管理员**配好下表。缺任何一个，工作流会在解码证书和描述文件之前退出，并且不会打印密钥的值。

配好之后，可以在 Actions 里对包含该工作流的分支手动运行，或等下一次 `main` 上的 iOS 改动。

Checklist:

- [ ] `ASC_ISSUER_ID`
- [ ] `ASC_KEY_ID`
- [ ] `ASC_API_KEY_P8`
- [ ] `BUILD_CERTIFICATE_BASE64` (Apple Distribution `.p12`)
- [ ] `P12_PASSWORD`
- [ ] `BUILD_PROVISION_PROFILE_BASE64` (`online.timia.ios`, App Store)
- [ ] `BUILD_PROVISION_PROFILE_WIDGET_BASE64` (`online.timia.ios.widget`, App Store)
- [ ] `APPLE_TEAM_ID` = `QTV9DUCAY7`

No `BUILD_PROVISION_PROFILE_WATCH_BASE64`. There is no watchOS target.

## Xcode

As of 2026-10-19, `macos-latest` is macOS 26 (arm64). The newest non-beta Xcode on that image is **26.6**, with the iOS 26.5 SDK.

截至 2026-10-19，`macos-latest` 是 macOS 26（arm64）。该镜像里最新的非 beta Xcode 是 **26.6**，自带 iOS 26.5 SDK。

The project declares `xcodeVersion` 26.0 (Swift 6). The deployment target is iOS 17.0, inside the Xcode 26.6 range iOS 15–26.5. The workflow picks the newest non-beta Xcode ≥ 26 and fails if the iOS SDK is below 17. A separate `xcode-27` image is newer and is not required. **Runner 上的 Xcode 不是过旧。**

工程部署目标是 iOS 17.0，落在 Xcode 26.6 支持的 iOS 15–26.5 里。`project.yml` 的 `xcodeVersion` 是 26.0。工作流会选镜像里版本 ≥ 26 的最新非 beta Xcode，并在 SDK 低于 17 时失败。单独的 `xcode-27` 镜像更新，但这个部署目标不需要它。

## Secrets

| Secret | 值 |
| --- | --- |
| `ASC_ISSUER_ID` | App Store Connect → 用户和访问 → 集成 → App Store Connect API 的 Issuer ID |
| `ASC_KEY_ID` | 该 API 密钥的 Key ID |
| `ASC_API_KEY_P8` | 下载的 `AuthKey_XXXX.p8` 全文（PEM）。页面只提供一次下载 |
| `BUILD_CERTIFICATE_BASE64` | Apple Distribution 证书的 `.p12`，做 base64。角色需要能管理证书和描述文件（Admin 或 App Manager） |
| `P12_PASSWORD` | 导出该 p12 时设的密码 |
| `BUILD_PROVISION_PROFILE_BASE64` | `online.timia.ios` 的 **App Store** 描述文件（`.mobileprovision` 的 base64） |
| `BUILD_PROVISION_PROFILE_WIDGET_BASE64` | `online.timia.ios.widget` 的 **App Store** 描述文件。Widget 的 bundle id 不同，必须单独一份 |
| `APPLE_TEAM_ID` | `QTV9DUCAY7` |

API 密钥、证书和两份描述文件要属于同一个团队。App Store Connect 应用 id 是 `6796896382`（bundle id `online.timia.ios`）。iPhone 的 App ID 要打开 HealthKit 和 HealthKit background delivery，和 `Timia/Resources/Timia.entitlements` 一致。Widget 的 entitlements 是空的，描述文件不要用 wildcard，也不要带设备列表（那是开发或企业描述文件）。

在 Mac 上生成 base64（换行会被去掉，带换行也可以）：

```bash
base64 -i distribution.p12 | tr -d '\n'
base64 -i timia-appstore.mobileprovision | tr -d '\n'
base64 -i timia-widget-appstore.mobileprovision | tr -d '\n'
```

## 签名 / Signing

Manual signing, matching the profiles installed on the runner. The iPhone app and the widget extension use different bundle ids, so **one profile cannot cover both**. There is no Watch profile.

用手动签名。iPhone 与 Widget 的 bundle id 不同，**一份描述文件盖不住两个目标**。

描述文件会装到 `~/Library/MobileDevice/Provisioning Profiles/`，并复制一份到 `~/Library/Developer/Xcode/UserData/Provisioning Profiles/`。p12 只进临时钥匙串。这些文件在 job 结束时删掉。

`Timia.xcscheme` 在 `.gitignore` 里（`xcodegen` / Xcode 会改它）。CI **不**跑 `xcodegen`，以免重写已提交的 `project.pbxproj`。job 按工程里的 target id 写一份临时 shared scheme（包含 `Timia` 和 `TimiaWidget`），归档用这份 scheme，结束时删掉。Widget 是 Timia 的嵌入依赖（`embed: true`），会打进同一个 archive。

## 版本号 / Version

CI does **not** commit a version bump. `git checkout` restores `project.pbxproj` at the end of the job.

CI **不会**把版本号提交回仓库。job 结束会把 `project.pbxproj` 还原。

- `MARKETING_VERSION`：沿用工程里的值（现在是 `0.1.0`）。App 与 Widget 的 Release 配置没单独写时，用工程级 Release 的值。两边不一致时，这次归档用较高的那个，不会自动加营销版本。要上新版本时，改 `codes/mobile/ios/project.yml` 里的 `MARKETING_VERSION`，再 `xcodegen generate`。
- `CFBundleVersion` / `CURRENT_PROJECT_VERSION`：用 ASC API 查这个营销版本已有的构建号，取最大的再 +1。还没有任何构建时用 `1`。上次手动上传是 `0.1.0` (`46`)，所以第一次成功的自动构建应是 `47`（以 ASC 上的记录为准）。查询遇到网络错误或 HTTP 5xx 时，退回 `github.run_number`。认证失败（401/403）会直接停下，避免用错构建号再传一次。
- 两个 Info.plist 的 `CFBundleVersion` 是 `$(CURRENT_PROJECT_VERSION)`，`CFBundleShortVersionString` 是 `$(MARKETING_VERSION)`。构建号通过本次 `xcodebuild` 的 build setting 传入，并只在 job 的工作区里改 Release 配置（含工程级 Release，App 和 Widget 会继承）。工程没有打开 `apple-generic` versioning，所以不用 `agvtool`。
- `project.yml` 里登记的 `CURRENT_PROJECT_VERSION` 是 `46`，和上次手动上传一致。CI 不会把它改回仓库。

## 上传 / Upload

导出 IPA（`app-store-connect` + `destination=export`）后，用 `xcrun altool --upload-app`。当前 Xcode 没有 altool 时改用 `xcrun iTMSTransporter`。API 密钥写到 `~/private_keys/AuthKey_<ASC_KEY_ID>.p8`。

上传成功后，按 bundle id `online.timia.ios` 查找这个构建号，最多等约 3 分钟，然后 `PATCH` `usesNonExemptEncryption=false`。处理若还没开始，这一步会是警告（`continue-on-error`），**IPA 已经在 App Store Connect**；TestFlight 若仍询问出口合规，在网页上补一次即可。不要为了补合规再跑整条工作流，否则会再上传一个新构建。
