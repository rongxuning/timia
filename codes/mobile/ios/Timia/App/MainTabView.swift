import SwiftUI

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
    }
}
