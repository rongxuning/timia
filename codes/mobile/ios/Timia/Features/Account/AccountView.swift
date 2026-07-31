import SwiftUI

struct AccountView: View {
    let user: CurrentUser
    @EnvironmentObject private var session: AppSession

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
