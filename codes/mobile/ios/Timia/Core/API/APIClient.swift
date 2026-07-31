import Foundation

enum APIError: LocalizedError, Equatable {
    case invalidConfiguration
    case invalidResponse
    case unauthorized
    case server(status: Int, message: String)
    case transport(String)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration: "API 地址配置无效"
        case .invalidResponse: "服务器返回了无法识别的数据"
        case .unauthorized: "登录已过期，请重新登录"
        case let .server(_, message): message
        case let .transport(message): message
        }
    }
}

struct EmptyResponse: Decodable, Sendable {}

struct APIClient: Sendable {
    let baseURL: URL
    var token: @Sendable () -> String?
    var onUnauthorized: @Sendable () -> Void
    private let session: URLSession

    init(
        baseURL: URL,
        session: URLSession = .shared,
        token: @escaping @Sendable () -> String?,
        onUnauthorized: @escaping @Sendable () -> Void = {}
    ) {
        self.baseURL = baseURL
        self.session = session
        self.token = token
        self.onUnauthorized = onUnauthorized
    }

    func request<Response: Decodable & Sendable>(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: (any Encodable & Sendable)? = nil,
        authenticated: Bool = true,
        response: Response.Type = Response.self
    ) async throws -> Response {
        guard var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidConfiguration
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidConfiguration }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try Self.encoder.encode(AnyEncodable(body))
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated, let token = token() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let data: Data
        let rawResponse: URLResponse
        do {
            (data, rawResponse) = try await session.data(for: request)
        } catch {
            throw APIError.transport(error.localizedDescription)
        }
        guard let http = rawResponse as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 {
            onUnauthorized()
            throw APIError.unauthorized
        }
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? Self.decoder.decode(ErrorEnvelope.self, from: data)
            throw APIError.server(status: http.statusCode, message: envelope?.detail ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode))
        }
        if Response.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! Response
        }
        do {
            return try Self.decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()
}

private struct ErrorEnvelope: Decodable { let detail: String? }

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeValue = value.encode }
    func encode(to encoder: Encoder) throws { try encodeValue(encoder) }
}
