import CryptoKit
import Foundation
import Security

final class KeychainStore: @unchecked Sendable {
    private let service = "online.timia.ios"

    enum Account {
        static let legacyAccessToken = "access-token"
        static let installationID = "mobile-installation-id"
        static let devicePrivateKey = "mobile-device-private-key"
        static let refreshToken = "mobile-refresh-token"
        static let sessionID = "mobile-session-id"
        static let pendingRefreshRequestID = "mobile-refresh-request-id"
    }

    func readString(_ account: String) -> String? {
        guard let data = readData(account) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func readData(_ account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else {
            return nil
        }
        return result as? Data
    }

    func saveString(
        _ value: String,
        account: String,
        accessibility: CFString = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    ) throws {
        try saveData(Data(value.utf8), account: account, accessibility: accessibility)
    }

    func saveData(
        _ data: Data,
        account: String,
        accessibility: CFString
    ) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let updates: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility
        ]
        let updateStatus = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw APIError.transport("无法安全更新登录信息")
        }
        let attributes: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility
        ]
        let status = SecItemAdd(attributes as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw APIError.transport("无法安全保存登录信息")
        }
    }

    func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    func deleteAuthentication() {
        delete(Account.legacyAccessToken)
        delete(Account.refreshToken)
        delete(Account.sessionID)
        delete(Account.pendingRefreshRequestID)
    }
}

actor CredentialManager {
    private struct RefreshSnapshot: Sendable {
        let baseURL: URL
        let installationID: String
        let privateKeyData: Data
        let refreshToken: String
        let sessionID: String
        let requestID: String
    }

    private let baseURL: URL
    private let session: URLSession
    private let keychain: KeychainStore
    private let installationID: String
    private let privateKey: P256.Signing.PrivateKey
    private let initializationErrorMessage: String?
    private var accessToken: String?
    private var accessTokenExpiresAt: Date?
    private var refreshToken: String?
    private var sessionID: String?
    private var legacyAccessToken: String?
    private var pendingRefreshRequestID: String?
    private var refreshTask: Task<MobileTokenResponse, Error>?

    init(baseURL: URL, session: URLSession = .shared, keychain: KeychainStore) {
        self.baseURL = baseURL
        self.session = session
        self.keychain = keychain

        var initializationErrorMessage: String?
        if let stored = keychain.readString(KeychainStore.Account.installationID) {
            installationID = stored
        } else {
            let generated = UUID().uuidString.lowercased()
            do {
                try keychain.saveString(generated, account: KeychainStore.Account.installationID)
            } catch {
                initializationErrorMessage = "无法保存设备标识"
            }
            installationID = generated
        }

        if let rawKey = keychain.readData(KeychainStore.Account.devicePrivateKey),
           let storedKey = try? P256.Signing.PrivateKey(rawRepresentation: rawKey) {
            privateKey = storedKey
        } else {
            let generated = P256.Signing.PrivateKey()
            do {
                try keychain.saveData(
                    generated.rawRepresentation,
                    account: KeychainStore.Account.devicePrivateKey,
                    accessibility: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
                )
            } catch {
                initializationErrorMessage = "无法保存设备密钥"
            }
            privateKey = generated
        }
        self.initializationErrorMessage = initializationErrorMessage

        refreshToken = keychain.readString(KeychainStore.Account.refreshToken)
        sessionID = keychain.readString(KeychainStore.Account.sessionID)
        legacyAccessToken = keychain.readString(KeychainStore.Account.legacyAccessToken)
        pendingRefreshRequestID = keychain.readString(KeychainStore.Account.pendingRefreshRequestID)
    }

    var hasRestorableCredential: Bool {
        (refreshToken != nil && sessionID != nil) || legacyAccessToken != nil
    }

    var needsLegacyExchange: Bool {
        refreshToken == nil && legacyAccessToken != nil
    }

    func tokenForRequest() async throws -> String? {
        try requireReady()
        if let accessToken,
           let accessTokenExpiresAt,
           accessTokenExpiresAt.timeIntervalSinceNow > 30 {
            return accessToken
        }
        if refreshToken != nil, sessionID != nil {
            return try await refresh().accessToken
        }
        return legacyAccessToken
    }

    func passwordLogin(email: String, password: String) async throws {
        try requireReady()
        try await registerDeviceIfNeeded()
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let challenge = try await challenge(purpose: "login")
        let message = [
            "timia-mobile-login",
            challenge.challengeId,
            challenge.nonce,
            installationID,
            Self.sha256(normalizedEmail)
        ].joined(separator: "\n")
        let response: MobileTokenResponse = try await post(
            "/auth/mobile/login/password",
            body: MobilePasswordLoginRequest(
                email: normalizedEmail,
                password: password,
                installationId: installationID,
                challengeId: challenge.challengeId,
                nonce: challenge.nonce,
                signature: try signature(for: message)
            )
        )
        try install(response)
    }

    func exchangeLegacyToken(userID: String) async throws {
        try requireReady()
        guard let legacyAccessToken else { throw APIError.unauthorized }
        try await registerDeviceIfNeeded()
        let challenge = try await challenge(purpose: "exchange")
        let message = [
            "timia-mobile-exchange",
            challenge.challengeId,
            challenge.nonce,
            installationID,
            userID
        ].joined(separator: "\n")
        let response: MobileTokenResponse = try await post(
            "/auth/mobile/token/exchange",
            body: MobileTokenExchangeRequest(
                installationId: installationID,
                challengeId: challenge.challengeId,
                nonce: challenge.nonce,
                signature: try signature(for: message)
            ),
            bearerToken: legacyAccessToken
        )
        try install(response)
    }

    func refresh(force: Bool = false) async throws -> MobileTokenResponse {
        try requireReady()
        if !force,
           let accessToken,
           let accessTokenExpiresAt,
           accessTokenExpiresAt.timeIntervalSinceNow > 30,
           let refreshToken,
           let sessionID {
            return MobileTokenResponse(
                accessToken: accessToken,
                expiresIn: Int(accessTokenExpiresAt.timeIntervalSinceNow),
                refreshToken: refreshToken,
                sessionId: sessionID
            )
        }
        if let refreshTask { return try await refreshTask.value }
        guard let refreshToken, let sessionID else { throw APIError.unauthorized }

        let requestID = pendingRefreshRequestID ?? UUID().uuidString.lowercased()
        if pendingRefreshRequestID == nil {
            try keychain.saveString(
                requestID,
                account: KeychainStore.Account.pendingRefreshRequestID
            )
            pendingRefreshRequestID = requestID
        }
        let snapshot = RefreshSnapshot(
            baseURL: baseURL,
            installationID: installationID,
            privateKeyData: privateKey.rawRepresentation,
            refreshToken: refreshToken,
            sessionID: sessionID,
            requestID: requestID
        )
        let urlSession = session
        let task = Task {
            try await Self.performRefresh(snapshot: snapshot, session: urlSession)
        }
        refreshTask = task
        do {
            let response = try await task.value
            refreshTask = nil
            try install(response)
            keychain.delete(KeychainStore.Account.pendingRefreshRequestID)
            pendingRefreshRequestID = nil
            return response
        } catch {
            refreshTask = nil
            if case APIError.unauthorized = error {
                clearSession()
            }
            throw error
        }
    }

    func clearSession() {
        accessToken = nil
        accessTokenExpiresAt = nil
        refreshToken = nil
        sessionID = nil
        legacyAccessToken = nil
        pendingRefreshRequestID = nil
        keychain.deleteAuthentication()
    }

    func takeAccessTokenAndClearSession() -> String? {
        let token = accessToken ?? legacyAccessToken
        clearSession()
        return token
    }

    private func registerDeviceIfNeeded() async throws {
        let challenge = try await challenge(purpose: "register")
        let publicKey = privateKey.publicKey.x963Representation.base64EncodedString()
        let message = [
            "timia-device-register",
            challenge.challengeId,
            challenge.nonce,
            installationID,
            Self.sha256(privateKey.publicKey.x963Representation)
        ].joined(separator: "\n")
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        let _: MobileDeviceResponse = try await post(
            "/auth/mobile/devices/register",
            body: MobileDeviceRegisterRequest(
                installationId: installationID,
                challengeId: challenge.challengeId,
                nonce: challenge.nonce,
                publicKey: publicKey,
                signature: try signature(for: message),
                deviceName: "iOS device",
                osVersion: ProcessInfo.processInfo.operatingSystemVersionString,
                appVersion: version
            )
        )
    }

    private func requireReady() throws {
        if let initializationErrorMessage {
            throw APIError.transport(initializationErrorMessage)
        }
    }

    private func challenge(purpose: String) async throws -> MobileChallengeResponse {
        try await post(
            "/auth/mobile/devices/challenge",
            body: MobileChallengeRequest(installationId: installationID, purpose: purpose)
        )
    }

    private func signature(for message: String) throws -> String {
        try privateKey.signature(for: Data(message.utf8)).derRepresentation.base64EncodedString()
    }

    private func install(_ response: MobileTokenResponse) throws {
        try keychain.saveString(response.refreshToken, account: KeychainStore.Account.refreshToken)
        do {
            try keychain.saveString(response.sessionId, account: KeychainStore.Account.sessionID)
        } catch {
            keychain.delete(KeychainStore.Account.refreshToken)
            throw error
        }
        keychain.delete(KeychainStore.Account.legacyAccessToken)
        accessToken = response.accessToken
        accessTokenExpiresAt = Date().addingTimeInterval(TimeInterval(response.expiresIn))
        refreshToken = response.refreshToken
        sessionID = response.sessionId
        legacyAccessToken = nil
    }

    private func post<Body: Encodable & Sendable, Response: Decodable>(
        _ path: String,
        body: Body,
        bearerToken: String? = nil
    ) async throws -> Response {
        try await Self.post(
            baseURL: baseURL,
            session: session,
            path: path,
            body: body,
            bearerToken: bearerToken
        )
    }

    private static func performRefresh(
        snapshot: RefreshSnapshot,
        session: URLSession
    ) async throws -> MobileTokenResponse {
        let challenge: MobileChallengeResponse = try await post(
            baseURL: snapshot.baseURL,
            session: session,
            path: "/auth/mobile/token/refresh/challenge",
            body: MobileRefreshChallengeRequest(
                installationId: snapshot.installationID,
                sessionId: snapshot.sessionID
            )
        )
        let message = [
            "timia-mobile-refresh",
            challenge.challengeId,
            challenge.nonce,
            snapshot.installationID,
            snapshot.sessionID,
            snapshot.requestID,
            sha256(snapshot.refreshToken)
        ].joined(separator: "\n")
        let key = try P256.Signing.PrivateKey(rawRepresentation: snapshot.privateKeyData)
        let signature = try key.signature(for: Data(message.utf8)).derRepresentation.base64EncodedString()
        return try await post(
            baseURL: snapshot.baseURL,
            session: session,
            path: "/auth/mobile/token/refresh",
            body: MobileRefreshRequest(
                sessionId: snapshot.sessionID,
                installationId: snapshot.installationID,
                refreshToken: snapshot.refreshToken,
                requestId: snapshot.requestID,
                challengeId: challenge.challengeId,
                nonce: challenge.nonce,
                signature: signature
            )
        )
    }

    private static func post<Body: Encodable & Sendable, Response: Decodable>(
        baseURL: URL,
        session: URLSession,
        path: String,
        body: Body,
        bearerToken: String? = nil
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearerToken {
            request.setValue("Bearer \(bearerToken)", forHTTPHeaderField: "Authorization")
        }
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        request.httpBody = try encoder.encode(body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let decoder = JSONDecoder()
            decoder.keyDecodingStrategy = .convertFromSnakeCase
            let envelope = try? decoder.decode(MobileErrorEnvelope.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                message: envelope?.detail ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            )
        }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    private static func sha256(_ value: String) -> String {
        sha256(Data(value.utf8))
    }

    private static func sha256(_ value: Data) -> String {
        SHA256.hash(data: value).map { String(format: "%02x", $0) }.joined()
    }
}

private struct MobileErrorEnvelope: Decodable {
    let detail: String?
}
