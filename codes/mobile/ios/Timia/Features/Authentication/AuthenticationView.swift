import AuthenticationServices
import CryptoKit
import SwiftUI

private enum AuthMode { case login, register }

private enum AuthField: Hashable {
    case email, displayName, password, confirmPassword
}

private enum DevelopmentLogin {
    #if DEBUG
    static let email = "admin@gmail.com"
    static let password = "admin1234"
    #else
    static let email = ""
    static let password = ""
    #endif
}

struct AuthenticationView: View {
    @EnvironmentObject private var session: AppSession
    @StateObject private var oauth = OAuthBrowser()
    @State private var phoneMask = PhoneDisplay.storedMask()
    @State private var mode: AuthMode = .login
    @State private var email = DevelopmentLogin.email
    @State private var displayName = ""
    @State private var password = DevelopmentLogin.password
    @State private var confirmPassword = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false
    @State private var showPhoneSheet = false
    @FocusState private var focusedField: AuthField?

    var body: some View {
        ZStack {
            Image("LoginBackground")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

            GeometryReader { proxy in
                let cardWidth = proxy.size.width * 0.58
                let contentWidth = cardWidth - 36
                let buttonWidth = contentWidth * 0.70
                ScrollView {
                    VStack {
                        Spacer(minLength: 16)
                        authenticationCard(
                            cardWidth: cardWidth,
                            contentWidth: contentWidth,
                            buttonWidth: buttonWidth
                        )
                        Spacer(minLength: 16)
                    }
                    .frame(minWidth: proxy.size.width, minHeight: proxy.size.height)
                }
                .scrollIndicators(.hidden)
            }
        }
        .keyboardDoneToolbar { focusedField = nil }
        .sheet(isPresented: $showPhoneSheet) {
            PhoneLoginSheet(mask: $phoneMask)
                .environmentObject(session)
        }
    }

    private func authenticationCard(
        cardWidth: CGFloat,
        contentWidth: CGFloat,
        buttonWidth: CGFloat
    ) -> some View {
        VStack(spacing: 0) {
            Text("Timia")
                .font(.system(size: 40, weight: .black, design: .rounded))
                .foregroundStyle(.white)

            Text("合抱之木，生于毫末")
                .font(.caption.weight(.medium))
                .foregroundStyle(LoginPalette.caption)
                .padding(.top, 10)

            Text(phoneMask)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(LoginPalette.phone)
                .padding(.top, 12)
                .accessibilityIdentifier("login.phoneNumber")

            VStack(spacing: 10) {
                compactButton(
                    title: "本手机号登录",
                    fill: LoginPalette.green,
                    foreground: .white,
                    width: buttonWidth,
                    identifier: "login.phone"
                ) {
                    errorMessage = nil
                    focusedField = nil
                    showPhoneSheet = true
                }

                compactButton(
                    title: "微信登录",
                    fill: LoginPalette.button,
                    foreground: .white,
                    width: buttonWidth,
                    identifier: "login.wechat",
                    icon: AnyView(WeChatMark())
                ) {
                    startWeChat()
                }

                compactButton(
                    title: "Google 邮箱登录",
                    fill: LoginPalette.button,
                    foreground: .white,
                    width: buttonWidth,
                    identifier: "login.google",
                    icon: AnyView(GoogleMark())
                ) {
                    startGoogle()
                }
            }
            .padding(.top, 16)
            .disabled(isSubmitting)
            .opacity(isSubmitting ? 0.72 : 1)

            orDivider
                .frame(width: contentWidth)
                .padding(.top, 14)

            VStack(spacing: 10) {
                LoginField(
                    placeholder: "邮箱",
                    text: $email,
                    icon: "envelope",
                    contentType: .emailAddress,
                    keyboard: .emailAddress,
                    field: .email,
                    focused: $focusedField
                )
                .onSubmit { focusedField = mode == .login ? .password : .displayName }

                if mode == .register {
                    LoginField(
                        placeholder: "显示名称",
                        text: $displayName,
                        icon: "person",
                        contentType: .name,
                        field: .displayName,
                        focused: $focusedField
                    )
                    .onSubmit { focusedField = .password }
                }

                LoginField(
                    placeholder: "密码",
                    text: $password,
                    icon: "lock",
                    isSecure: true,
                    contentType: mode == .login ? .password : .newPassword,
                    field: .password,
                    focused: $focusedField
                )
                .onSubmit { focusedField = mode == .login ? nil : .confirmPassword }

                if mode == .register {
                    LoginField(
                        placeholder: "确认密码",
                        text: $confirmPassword,
                        icon: "lock",
                        isSecure: true,
                        contentType: .newPassword,
                        field: .confirmPassword,
                        focused: $focusedField
                    )
                    .onSubmit { focusedField = nil }
                }
            }
            .frame(width: contentWidth)
            .padding(.top, 12)
            .onChange(of: email) { _, _ in errorMessage = nil }
            .onChange(of: displayName) { _, _ in errorMessage = nil }
            .onChange(of: password) { _, _ in errorMessage = nil }
            .onChange(of: confirmPassword) { _, _ in errorMessage = nil }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(errorMessage == "注册成功，请登录" ? LoginPalette.green : Color(red: 1, green: 0.45, blue: 0.42))
                    .multilineTextAlignment(.center)
                    .frame(width: contentWidth)
                    .padding(.top, 10)
            }

            Button(action: submitPassword) {
                Text(mode == .login ? "登录" : "创建账号")
                    .font(.system(size: 15, weight: .semibold))
                    .frame(width: contentWidth, height: 44)
                    .foregroundStyle(.white)
                    .background(LoginPalette.green, in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .disabled(isSubmitting)
            .opacity(isSubmitting ? 0.72 : 1)
            .padding(.top, 12)
            .accessibilityIdentifier("login.email")

            HStack {
                if mode == .login {
                    Button("忘记密码？") {
                        focusedField = nil
                        errorMessage = "暂不支持在线重置密码"
                    }
                    .foregroundStyle(LoginPalette.caption)
                    .accessibilityIdentifier("login.forgot")
                    Spacer(minLength: 8)
                }
                Button(mode == .login ? "注册账号" : "返回登录") {
                    switchMode()
                }
                .foregroundStyle(.white)
                .accessibilityIdentifier("login.register")
            }
            .font(.caption)
            .frame(width: contentWidth)
            .padding(.top, 10)
            .disabled(isSubmitting)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 22)
        .frame(width: cardWidth)
        .preferredColorScheme(.dark)
        .background(LoginPalette.card, in: RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(.white, lineWidth: 4)
        }
        .shadow(color: .black.opacity(0.28), radius: 16, y: 7)
    }

    private var orDivider: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(Color.white.opacity(0.22))
                .frame(height: 1)
            Text("or")
                .font(.caption)
                .foregroundStyle(Color.white.opacity(0.55))
            Rectangle()
                .fill(Color.white.opacity(0.22))
                .frame(height: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("or")
    }

    private func compactButton(
        title: String,
        fill: Color,
        foreground: Color,
        width: CGFloat,
        identifier: String,
        icon: AnyView? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon {
                    icon
                }
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(width: width, height: 38)
            .foregroundStyle(foreground)
            .background(fill, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    private func startWeChat() {
        errorMessage = nil
        guard let appID = LoginProviders.value("TIMIA_WECHAT_APP_ID") else {
            showNotConfigured()
            return
        }
        let redirect = LoginProviders.value("TIMIA_WECHAT_REDIRECT_URI")
            ?? "https://timia.online/core-service/auth/mobile/oauth/wechat/callback"
        let state = UUID().uuidString.lowercased()
        var components = URLComponents(string: "https://open.weixin.qq.com/connect/qrconnect")
        components?.queryItems = [
            URLQueryItem(name: "appid", value: appID),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "snsapi_login"),
            URLQueryItem(name: "state", value: state)
        ]
        components?.fragment = "wechat_redirect"
        guard let url = components?.url else {
            showNotConfigured()
            return
        }
        beginOAuth(url: url, state: state, provider: "wechat", redirectURI: nil, codeVerifier: nil)
    }

    private func startGoogle() {
        errorMessage = nil
        guard let clientID = LoginProviders.value("TIMIA_GOOGLE_CLIENT_ID") else {
            showNotConfigured()
            return
        }
        let redirect = LoginProviders.value("TIMIA_GOOGLE_REDIRECT_URI")
            ?? "https://timia.online/core-service/auth/mobile/oauth/google/callback"
        let pkce = LoginPKCE.make()
        let state = UUID().uuidString.lowercased()
        var components = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")
        components?.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "code_challenge", value: pkce.challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state)
        ]
        guard let url = components?.url else {
            showNotConfigured()
            return
        }
        beginOAuth(
            url: url,
            state: state,
            provider: "google",
            redirectURI: redirect,
            codeVerifier: pkce.verifier
        )
    }

    private func beginOAuth(
        url: URL,
        state: String,
        provider: String,
        redirectURI: String?,
        codeVerifier: String?
    ) {
        isSubmitting = true
        oauth.start(url: url, callbackScheme: "timia") { callback, error in
            Task { @MainActor in
                await finishOAuth(
                    provider: provider,
                    callback: callback,
                    error: error,
                    expectedState: state,
                    redirectURI: redirectURI,
                    codeVerifier: codeVerifier
                )
            }
        }
    }

    @MainActor
    private func finishOAuth(
        provider: String,
        callback: URL?,
        error: Error?,
        expectedState: String,
        redirectURI: String?,
        codeVerifier: String?
    ) async {
        defer { isSubmitting = false }
        if let authError = error as? ASWebAuthenticationSessionError, authError.code == .canceledLogin {
            return
        }
        guard let callback,
              let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
              let code = items.first(where: { $0.name == "code" })?.value,
              items.first(where: { $0.name == "state" })?.value == expectedState
        else {
            errorMessage = "登录未完成"
            return
        }
        do {
            try await session.loginWithOAuth(
                provider: provider,
                code: code,
                redirectURI: redirectURI,
                codeVerifier: codeVerifier
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func showNotConfigured() {
        #if DEBUG
        errorMessage = "未配置"
        #else
        errorMessage = "暂不可用"
        #endif
    }

    private func switchMode() {
        focusedField = nil
        withAnimation(.easeInOut(duration: 0.2)) {
            let next: AuthMode = mode == .login ? .register : .login
            if next == .register {
                if email == DevelopmentLogin.email {
                    email = ""
                }
                password = ""
            } else {
                if email.isEmpty {
                    email = DevelopmentLogin.email
                }
                password = DevelopmentLogin.password
            }
            mode = next
            errorMessage = nil
            confirmPassword = ""
            displayName = ""
        }
    }

    private func submitPassword() {
        focusedField = nil
        errorMessage = nil
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedEmail.isEmpty else { errorMessage = "请输入邮箱"; return }
        guard password.count >= 8 else { errorMessage = "密码至少 8 位"; return }
        if mode == .register {
            guard !normalizedName.isEmpty else { errorMessage = "请输入显示名称"; return }
            guard password == confirmPassword else { errorMessage = "两次输入的密码不一致"; return }
        }
        isSubmitting = true
        Task {
            do {
                if mode == .login {
                    try await session.login(email: normalizedEmail, password: password)
                } else {
                    try await session.register(
                        email: normalizedEmail,
                        displayName: normalizedName,
                        password: password
                    )
                    mode = .login
                    password = ""
                    confirmPassword = ""
                    errorMessage = "注册成功，请登录"
                }
            } catch {
                errorMessage = error.localizedDescription
            }
            isSubmitting = false
        }
    }
}

private struct LoginField: View {
    let placeholder: String
    @Binding var text: String
    let icon: String
    var isSecure = false
    var contentType: UITextContentType?
    var keyboard: UIKeyboardType = .default
    let field: AuthField
    let focused: FocusState<AuthField?>.Binding

    var body: some View {
        HStack(spacing: 8) {
            Group {
                if isSecure {
                    SecureField(placeholder, text: $text)
                } else {
                    TextField(placeholder, text: $text)
                }
            }
            .textContentType(contentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(keyboard)
            .focused(focused, equals: field)
            .foregroundStyle(.white)

            Image(systemName: icon)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(LoginPalette.caption)
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(LoginPalette.field, in: RoundedRectangle(cornerRadius: 12))
        .preferredColorScheme(.dark)
    }
}

private struct PhoneLoginSheet: View {
    @Binding var mask: String
    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var phone = UserDefaults.standard.string(forKey: PhoneDisplay.storageKey) ?? ""
    @State private var code = ""
    @State private var challenge: PhoneCodeResponse?
    @State private var errorMessage: String?
    @State private var infoMessage: String?
    @State private var isSending = false
    @State private var isVerifying = false
    @FocusState private var focused: Field?

    private enum Field { case phone, code }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 14) {
                TextField("手机号", text: $phone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focused, equals: .phone)
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .background(LoginPalette.field, in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(.white)

                HStack(spacing: 10) {
                    TextField("验证码", text: $code)
                        .keyboardType(.numberPad)
                        .textContentType(.oneTimeCode)
                        .focused($focused, equals: .code)
                        .padding(.horizontal, 14)
                        .frame(height: 44)
                        .background(LoginPalette.field, in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                    Button(isSending ? "发送中" : "获取验证码") {
                        Task { await sendCode() }
                    }
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                    .disabled(isSending || isVerifying)
                }

                if let infoMessage {
                    Text(infoMessage)
                        .font(.caption)
                        .foregroundStyle(LoginPalette.caption)
                }
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Color(red: 1, green: 0.45, blue: 0.42))
                }

                Button {
                    Task { await verify() }
                } label: {
                    Text(isVerifying ? "登录中" : "登录")
                        .font(.system(size: 15, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .foregroundStyle(.white)
                        .background(LoginPalette.green, in: Capsule())
                }
                .buttonStyle(.plain)
                .disabled(isSending || isVerifying)
                Spacer()
            }
            .padding(20)
            .background(LoginPalette.card.ignoresSafeArea())
            .navigationTitle("本手机号登录")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("关闭") { dismiss() }
                }
            }
            .keyboardDoneToolbar { focused = nil }
        }
        .presentationDetents([.medium])
        .preferredColorScheme(.dark)
    }

    private func sendCode() async {
        errorMessage = nil
        infoMessage = nil
        isSending = true
        defer { isSending = false }
        do {
            let response = try await session.sendPhoneCode(phone)
            challenge = response
            #if DEBUG
            if let devCode = response.devCode, !devCode.isEmpty {
                code = devCode
                infoMessage = "开发环境验证码已填入"
            }
            #endif
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func verify() async {
        errorMessage = nil
        guard let challenge else {
            errorMessage = "请先获取验证码"
            return
        }
        isVerifying = true
        defer { isVerifying = false }
        do {
            let normalized = try PhoneDisplay.normalize(phone)
            try await session.loginWithPhone(
                phone: normalized,
                code: code.trimmingCharacters(in: .whitespacesAndNewlines),
                challengeId: challenge.challengeId,
                nonce: challenge.nonce
            )
            PhoneDisplay.remember(normalized)
            mask = PhoneDisplay.mask(normalized)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private enum LoginPalette {
    static let card = Color(red: 28 / 255, green: 28 / 255, blue: 30 / 255)
    static let button = Color(red: 44 / 255, green: 44 / 255, blue: 46 / 255)
    static let field = Color(red: 58 / 255, green: 58 / 255, blue: 60 / 255)
    static let green = Color(red: 30 / 255, green: 158 / 255, blue: 74 / 255)
    static let caption = Color.white.opacity(0.55)
    static let phone = Color.white.opacity(0.92)
}

private enum LoginProviders {
    static func value(_ key: String) -> String? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.contains("$(") { return nil }
        return trimmed
    }
}

private enum LoginPKCE {
    static func make() -> (verifier: String, challenge: String) {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let verifier = Data(bytes).base64URLEncoded()
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return (verifier, Data(digest).base64URLEncoded())
    }
}

private struct WeChatMark: View {
    var body: some View {
        ZStack {
            Circle()
                .fill(Color(red: 0.13, green: 0.75, blue: 0.33))
            Image(systemName: "bubble.left.fill")
                .font(.system(size: 8, weight: .bold))
                .foregroundStyle(.white)
                .offset(x: -1, y: 1)
        }
        .frame(width: 16, height: 16)
    }
}

private struct GoogleMark: View {
    var body: some View {
        Text("G")
            .font(.system(size: 13, weight: .heavy, design: .rounded))
            .foregroundStyle(
                LinearGradient(
                    colors: [
                        Color(red: 0.26, green: 0.52, blue: 0.96),
                        Color(red: 0.92, green: 0.26, blue: 0.21),
                        Color(red: 0.98, green: 0.74, blue: 0.02),
                        Color(red: 0.20, green: 0.66, blue: 0.33)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .frame(width: 16, height: 16)
    }
}

private extension Data {
    func base64URLEncoded() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}

private final class OAuthBrowser: NSObject, ObservableObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(url: URL, callbackScheme: String, completion: @escaping (URL?, Error?) -> Void) {
        let session = ASWebAuthenticationSession(
            url: url,
            callbackURLScheme: callbackScheme,
            completionHandler: completion
        )
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = true
        self.session = session
        if !session.start() {
            self.session = nil
            completion(nil, URLError(.badURL))
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap(\.windows).first { $0.isKeyWindow }
        return window ?? ASPresentationAnchor(frame: UIScreen.main.bounds)
    }
}
