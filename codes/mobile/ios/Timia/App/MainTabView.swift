import SwiftUI

private struct NavigateToAppHomeKey: EnvironmentKey {
    static var defaultValue: () -> Void { {} }
}

extension EnvironmentValues {
    var navigateToAppHome: () -> Void {
        get { self[NavigateToAppHomeKey.self] }
        set { self[NavigateToAppHomeKey.self] = newValue }
    }
}

struct MainTabView: View {
    let user: CurrentUser
    @State private var showWorkspaces = false
    @State private var showAccount = false

    var body: some View {
        NavigationStack {
            ScheduleHomeView(
                user: user,
                onOpenWorkspaces: { showWorkspaces = true },
                onOpenAccount: { showAccount = true }
            )
            .navigationDestination(isPresented: $showWorkspaces) {
                WorkspacesView()
            }
            .navigationDestination(isPresented: $showAccount) {
                AccountView(user: user)
            }
        }
        .tint(TimiaTheme.primary)
        .environment(\.navigateToAppHome) {
            showWorkspaces = false
            showAccount = false
        }
    }
}
