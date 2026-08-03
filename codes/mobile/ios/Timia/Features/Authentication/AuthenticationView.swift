import SwiftUI

private enum AuthenticationFocusField: Hashable {
    case email
    case displayName
    case password
    case confirmPassword
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
    @State private var mode: Mode = .login
    @State private var email = DevelopmentLogin.email
    @State private var displayName = ""
    @State private var password = DevelopmentLogin.password
    @State private var confirmPassword = ""
    @State private var errorMessage: String?
    @State private var isSubmitting = false
    @FocusState private var focusedField: AuthenticationFocusField?
    @EnvironmentObject private var session: AppSession

    private enum Mode { case login, register }
    private let authPurple = TimiaTheme.primary

    var body: some View {
        ZStack {
            Image("LoginBackground")
                .resizable()
                .scaledToFill()
                .ignoresSafeArea()

            Color.black.opacity(0.08)
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture { focusedField = nil }

            authenticationCard
                .padding(.horizontal, 42)
                .padding(.vertical, 28)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
        .keyboardDoneToolbar { focusedField = nil }
    }

    private var authenticationCard: some View {
        VStack(spacing: 20) {
            VStack(spacing: 9) {
                Text("Timia")
                    .font(.system(size: 42, weight: .black, design: .rounded))
                    .foregroundStyle(.primary)

                VStack(spacing: 3) {
                    Text("合抱之木，生于毫末")
                    Text("九层之台，起于累土")
                    Text("千里之行，始于足下")
                }
                .font(.caption.weight(.medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.bottom, 3)

            VStack(spacing: 13) {
                FloatingAuthField(
                    title: "Email",
                    text: $email,
                    icon: "envelope",
                    field: .email,
                    focusedField: $focusedField,
                    textContentType: .emailAddress,
                    keyboardType: .emailAddress,
                    tint: authPurple
                )
                .submitLabel(.next)
                .onSubmit {
                    focusedField = mode == .login ? .password : .displayName
                }

                if mode == .register {
                    FloatingAuthField(
                        title: "显示名称",
                        text: $displayName,
                        icon: "person",
                        field: .displayName,
                        focusedField: $focusedField,
                        textContentType: .name,
                        tint: authPurple
                    )
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                }

                FloatingAuthField(
                    title: "Password",
                    text: $password,
                    icon: "lock",
                    field: .password,
                    focusedField: $focusedField,
                    isSecure: true,
                    textContentType: mode == .login ? .password : .newPassword,
                    tint: authPurple
                )
                .submitLabel(mode == .login ? .done : .next)
                .onSubmit {
                    focusedField = mode == .login ? nil : .confirmPassword
                }

                if mode == .register {
                    FloatingAuthField(
                        title: "Confirm Password",
                        text: $confirmPassword,
                        icon: "lock",
                        field: .confirmPassword,
                        focusedField: $focusedField,
                        isSecure: true,
                        textContentType: .newPassword,
                        tint: authPurple
                    )
                    .submitLabel(.done)
                    .onSubmit { focusedField = nil }
                }
            }
            .onChange(of: email) { _, _ in errorMessage = nil }
            .onChange(of: displayName) { _, _ in errorMessage = nil }
            .onChange(of: password) { _, _ in errorMessage = nil }
            .onChange(of: confirmPassword) { _, _ in errorMessage = nil }

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(errorMessage == "注册成功，请登录" ? .green : .red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            VStack(spacing: 11) {
                Button(action: submit) {
                    Group {
                        if isSubmitting {
                            ProgressView().tint(.white)
                        } else {
                            Text(mode == .login ? "登录" : "创建账号").fontWeight(.bold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .foregroundStyle(.white)
                    .background(authPurple, in: RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
                .opacity(isSubmitting ? 0.72 : 1)

                Button {
                    switchMode()
                } label: {
                    HStack(spacing: 4) {
                        Text(mode == .login ? "还没有账号？" : "已有账号？")
                            .foregroundStyle(.secondary)
                        Text(mode == .login ? "注册" : "返回登录")
                            .fontWeight(.bold)
                            .foregroundStyle(authPurple)
                    }
                    .font(.footnote)
                    .padding(.vertical, 6)
                }
                .buttonStyle(.plain)
                .disabled(isSubmitting)
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .frame(maxWidth: 300)
        .background {
            RoundedRectangle(cornerRadius: 20)
                .fill(TimiaTheme.card)
                .contentShape(Rectangle())
                .onTapGesture { focusedField = nil }
        }
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(.primary, lineWidth: 4) }
        .shadow(color: TimiaTheme.shadow, radius: 16, y: 7)
    }

    private func switchMode() {
        focusedField = nil
        withAnimation(.easeInOut(duration: 0.2)) {
            let nextMode: Mode = mode == .login ? .register : .login
            if nextMode == .register {
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
            mode = nextMode
            errorMessage = nil
            confirmPassword = ""
        }
    }

    private func submit() {
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
                    try await session.register(email: normalizedEmail, displayName: normalizedName, password: password)
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

private struct FloatingAuthField: View {
    let title: String
    @Binding var text: String
    let icon: String
    let field: AuthenticationFocusField
    let focusedField: FocusState<AuthenticationFocusField?>.Binding
    var isSecure = false
    var textContentType: UITextContentType? = nil
    var keyboardType: UIKeyboardType = .default
    let tint: Color

    private var isLabelRaised: Bool {
        isFocused || !text.isEmpty
    }

    private var isFocused: Bool {
        focusedField.wrappedValue == field
    }

    var body: some View {
        ZStack(alignment: .leading) {
            Group {
                if isSecure {
                    SecureField("", text: $text)
                } else {
                    TextField("", text: $text)
                }
            }
            .textContentType(textContentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(keyboardType)
            .focused(focusedField, equals: field)
            .padding(.leading, 14)
            .padding(.trailing, 42)
            .padding(.top, isLabelRaised ? 12 : 0)
            .frame(height: 50)

            Text(title)
                .font(.system(size: isLabelRaised ? 11 : 16, weight: .regular))
                .foregroundStyle(isFocused ? tint : Color.secondary)
                .offset(x: 14, y: isLabelRaised ? -13 : 0)
                .allowsHitTesting(false)

            HStack {
                Spacer()
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(isFocused ? tint : Color.secondary)
                    .padding(.trailing, 14)
            }
            .allowsHitTesting(false)
        }
        .frame(height: 50)
        .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 11))
        .overlay {
            RoundedRectangle(cornerRadius: 11)
                .stroke(isFocused ? tint.opacity(0.12) : .clear, lineWidth: 7)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 11)
                .stroke(isFocused ? tint : TimiaTheme.border, lineWidth: isFocused ? 1.5 : 1)
        }
        .animation(.easeInOut(duration: 0.2), value: isLabelRaised)
        .animation(.easeInOut(duration: 0.2), value: isFocused)
    }
}
