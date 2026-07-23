import SwiftUI

struct MainTabView: View {
    private enum Tab: Hashable {
        case schedule
        case workspaces
        case addTask
        case analytics
        case account
    }

    let user: CurrentUser
    @State private var selectedTab: Tab = .schedule
    @State private var previousTab: Tab = .schedule
    @State private var createTask = false

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { ScheduleView() }
                .tabItem { Label("日程", systemImage: "calendar") }
                .tag(Tab.schedule)

            NavigationStack { WorkspacesView() }
                .tabItem { Label("空间", systemImage: "square.grid.2x2") }
                .tag(Tab.workspaces)

            Color.clear
                .tabItem { Label("添加", systemImage: "plus.circle.fill") }
                .tag(Tab.addTask)

            NavigationStack { AnalyticsPlaceholderView() }
                .tabItem { Label("分析", systemImage: "chart.bar") }
                .tag(Tab.analytics)

            NavigationStack { AccountView(user: user) }
                .tabItem { Label("我的", systemImage: "person.crop.circle") }
                .tag(Tab.account)
        }
        .tint(TimiaTheme.primary)
        .onChange(of: selectedTab) { oldValue, newValue in
            if newValue == .addTask {
                selectedTab = oldValue == .addTask ? previousTab : oldValue
                createTask = true
            } else {
                previousTab = newValue
            }
        }
        .sheet(isPresented: $createTask) {
            NavigationStack {
                TaskEditorView(mode: .create) { }
            }
        }
    }
}

private struct AnalyticsPlaceholderView: View {
    var body: some View {
        Color(uiColor: .systemBackground)
            .ignoresSafeArea()
            .toolbar(.hidden, for: .navigationBar)
            .accessibilityLabel("分析页面")
    }
}
