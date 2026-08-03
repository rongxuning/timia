import Foundation

@MainActor
final class AppSession: ObservableObject {
    enum State: Equatable {
        case loading
        case signedOut
        case restoreUnavailable(String)
        case signedIn(CurrentUser)
    }

    @Published private(set) var state: State = .loading
    private let credentials: CredentialManager
    private let baseURL: URL
    lazy var api: APIClient = APIClient(
        baseURL: baseURL,
        credentials: credentials,
        onUnauthorized: { [weak self] in
            Task { @MainActor in await self?.invalidateSession() }
        }
    )

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "TIMIA_API_BASE_URL") as? String
        baseURL = URL(string: configured ?? "") ?? URL(string: "http://127.0.0.1:8000")!
        let keychain = KeychainStore()
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
            keychain.deleteAuthentication()
        }
        credentials = CredentialManager(baseURL: baseURL, keychain: keychain)
    }

    func restore() async {
        guard await credentials.hasRestorableCredential else {
            state = .signedOut
            return
        }
        state = .loading
        do {
            if await credentials.needsLegacyExchange {
                let me = try await api.request("/auth/me", response: CurrentUser.self)
                try await credentials.exchangeLegacyToken(userID: me.id)
                state = .signedIn(me)
            } else {
                _ = try await credentials.refresh()
                let me = try await api.request("/auth/me", response: CurrentUser.self)
                state = .signedIn(me)
            }
        } catch APIError.unauthorized {
            await invalidateSession()
        } catch {
            state = .restoreUnavailable(error.localizedDescription)
        }
    }

    func login(email: String, password: String) async throws {
        try await credentials.passwordLogin(email: email, password: password)
        let me = try await api.request("/auth/me", response: CurrentUser.self)
        state = .signedIn(me)
    }

    func register(email: String, displayName: String, password: String) async throws {
        _ = try await api.request(
            "/auth/register",
            method: "POST",
            body: RegisterRequest(email: email, displayName: displayName, password: password),
            authenticated: false,
            response: CurrentUser.self
        )
    }

    func signOut() {
        state = .signedOut
        Task { @MainActor in
            guard let token = await credentials.takeAccessTokenAndClearSession() else { return }
            var request = URLRequest(url: baseURL.appending(path: "/auth/mobile/logout"))
            request.httpMethod = "POST"
            request.timeoutInterval = 10
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            _ = try? await URLSession.shared.data(for: request)
        }
    }

    private func invalidateSession() async {
        await credentials.clearSession()
        state = .signedOut
    }
}
