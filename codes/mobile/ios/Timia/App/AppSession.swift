import Foundation

@MainActor
final class AppSession: ObservableObject {
    enum State: Equatable { case loading, signedOut, signedIn(CurrentUser) }

    @Published private(set) var state: State = .loading
    private let keychain = KeychainStore()
    nonisolated(unsafe) private var accessToken: String?
    private let baseURL: URL
    lazy var api: APIClient = APIClient(
        baseURL: baseURL,
        token: { [weak self] in self?.accessToken },
        onUnauthorized: { [weak self] in
            Task { @MainActor in self?.signOut() }
        }
    )

    init() {
        let configured = Bundle.main.object(forInfoDictionaryKey: "TIMIA_API_BASE_URL") as? String
        baseURL = URL(string: configured ?? "") ?? URL(string: "http://127.0.0.1:8000")!
        if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
            keychain.deleteToken()
        }
        accessToken = keychain.readToken()
    }

    func restore() async {
        guard accessToken != nil else {
            state = .signedOut
            return
        }
        do {
            let me = try await api.request("/auth/me", response: CurrentUser.self)
            state = .signedIn(me)
        } catch {
            signOut()
        }
    }

    func login(email: String, password: String) async throws {
        let token = try await api.request(
            "/auth/login",
            method: "POST",
            body: LoginRequest(email: email, password: password),
            authenticated: false,
            response: TokenResponse.self
        )
        try keychain.saveToken(token.accessToken)
        accessToken = token.accessToken
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
        keychain.deleteToken()
        accessToken = nil
        state = .signedOut
    }
}
