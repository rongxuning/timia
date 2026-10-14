import SwiftUI

struct AccountView: View {
    let user: CurrentUser
    @EnvironmentObject private var session: AppSession
    @State private var weekStartError: String?

    var body: some View {
        List {
            Section {
                HStack(spacing: 14) {
                    Text(String(user.displayName.prefix(1)).uppercased())
                        .font(.title2.bold())
                        .frame(width: 52, height: 52)
                        .background(TimiaTheme.primary.opacity(0.15), in: Circle())
                    VStack(alignment: .leading) {
                        Text(user.displayName).font(.headline)
                        Text(user.email).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .padding(.vertical, 6)
            }
            Section("健康与健身") {
                NavigationLink {
                    HealthSyncView()
                } label: {
                    Label("健康数据", systemImage: "heart.text.square")
                }
                NavigationLink {
                    WorkoutSyncView()
                } label: {
                    Label("训练记录", systemImage: "figure.run")
                }
            }
            ScreenNotificationSettingsSection()
            Section("日历") {
                WeekStartPicker(weekStartsOn: user.weekStartsOn) { value in
                    Task {
                        do {
                            try await session.updateWeekStartsOn(value)
                            weekStartError = nil
                        } catch {
                            weekStartError = "保存失败"
                        }
                    }
                }
                if let weekStartError {
                    Text(weekStartError).font(.footnote).foregroundStyle(.red)
                }
            }
            if user.isSystemAdmin {
                Section("管理") {
                    NavigationLink("成员") { UserDirectoryView() }
                }
            }
            Section {
                Button("退出登录", role: .destructive) { session.signOut() }
            }
        }
        .navigationTitle("我的")
    }
}

private struct WeekStartPicker: View {
    let weekStartsOn: Int
    let onSelect: (Int) -> Void

    private let choices: [(Int, String)] = [
        (WeekStartDay.monday, "周一"),
        (WeekStartDay.saturday, "周六"),
        (WeekStartDay.sunday, "周日"),
    ]

    var body: some View {
        Picker("一周从哪天开始", selection: Binding(
            get: { WeekStartDay.normalized(weekStartsOn) },
            set: { value in
                guard value != WeekStartDay.normalized(weekStartsOn) else { return }
                onSelect(value)
            }
        )) {
            ForEach(choices, id: \.0) { choice in
                Text(choice.1).tag(choice.0)
            }
        }
        .pickerStyle(.menu)
    }
}
