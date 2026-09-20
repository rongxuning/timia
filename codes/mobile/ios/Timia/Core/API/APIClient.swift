import Foundation
import os

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
        case let .server(status, message): Self.userFacingServerMessage(status: status, message: message)
        case let .transport(message): message
        }
    }

    var isNotFound: Bool {
        guard case let .server(status, message) = self else { return false }
        if status == 404 { return true }
        let normalized = message.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalized == "not_found" || normalized == "not found"
    }

    static func userFacingServerMessage(status: Int, message: String) -> String {
        let normalized = message.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch normalized {
        case "not_found", "not found", "item_not_found":
            return "未找到"
        case "geo_provider_error":
            return "地点搜索暂时不可用"
        case "geo_rate_limited":
            return "搜索过快，请稍后再试"
        default:
            if status == 404 { return "未找到" }
            return message
        }
    }
}

struct EmptyResponse: Decodable, Sendable {}

struct APIClient: Sendable {
    private static let healthSyncLog = Logger(subsystem: "Timia.HealthSync", category: "Upload")

    let baseURL: URL
    let credentials: CredentialManager
    var onUnauthorized: @Sendable () -> Void
    private let session: URLSession

    init(
        baseURL: URL,
        credentials: CredentialManager,
        session: URLSession = .shared,
        onUnauthorized: @escaping @Sendable () -> Void = {}
    ) {
        self.baseURL = baseURL
        self.credentials = credentials
        self.session = session
        self.onUnauthorized = onUnauthorized
    }

    func request<Response: Decodable & Sendable>(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: (any Encodable & Sendable)? = nil,
        authenticated: Bool = true,
        compress: Bool = false,
        timeoutInterval: TimeInterval? = nil,
        response: Response.Type = Response.self
    ) async throws -> Response {
        guard var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidConfiguration
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidConfiguration }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = timeoutInterval ?? 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            let json = try Self.encoder.encode(AnyEncodable(body))
            if compress {
                let gzipped = try Self.gzipCompress(json)
                request.httpBody = gzipped
                request.setValue("gzip", forHTTPHeaderField: "Content-Encoding")
                let gzipRatio = gzipped.count > 0 ? Double(json.count) / Double(gzipped.count) : 0
                Self.healthSyncLog.debug(
                    "gzip_ratio=\(gzipRatio, format: .fixed(precision: 2), privacy: .public) batch_bytes=\(json.count, privacy: .public) path=\(path, privacy: .public)"
                )
            } else {
                request.httpBody = json
            }
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authenticated {
            do {
                if let token = try await credentials.tokenForRequest() {
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
            } catch APIError.unauthorized {
                onUnauthorized()
                throw APIError.unauthorized
            }
        }

        var (data, rawResponse) = try await perform(request)
        guard let http = rawResponse as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401, authenticated {
            do {
                let refreshed = try await credentials.refresh(force: true)
                request.setValue("Bearer \(refreshed.accessToken)", forHTTPHeaderField: "Authorization")
                (data, rawResponse) = try await perform(request)
            } catch APIError.unauthorized {
                onUnauthorized()
                throw APIError.unauthorized
            }
        }
        guard let finalHTTP = rawResponse as? HTTPURLResponse else { throw APIError.invalidResponse }
        if finalHTTP.statusCode == 401 {
            onUnauthorized()
            throw APIError.unauthorized
        }
        guard (200..<300).contains(finalHTTP.statusCode) else {
            let envelope = try? Self.decoder.decode(ErrorEnvelope.self, from: data)
            throw APIError.server(status: finalHTTP.statusCode, message: envelope?.detail ?? HTTPURLResponse.localizedString(forStatusCode: finalHTTP.statusCode))
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

    private func perform(_ request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.transport(error.localizedDescription)
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

    private static func gzipCompress(_ data: Data) throws -> Data {
        try data.gzipCompressed()
    }

    func uploadMultipart<Response: Decodable & Sendable>(
        _ path: String,
        fields: [String: String],
        filename: String,
        mimeType: String,
        data: Data,
        fileField: String = "file",
        timeoutInterval: TimeInterval = 300,
        response: Response.Type = Response.self
    ) async throws -> Response {
        guard let components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidConfiguration
        }
        guard let url = components.url else { throw APIError.invalidConfiguration }
        let boundary = "Boundary-\(UUID().uuidString)"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = timeoutInterval
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.multipartBody(
            boundary: boundary,
            fields: fields,
            fileField: fileField,
            filename: filename,
            mimeType: mimeType,
            data: data
        )
        return try await send(request, authenticated: true, response: Response.self)
    }

    func downloadData(_ path: String, query: [URLQueryItem] = []) async throws -> Data {
        guard var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidConfiguration
        }
        if !query.isEmpty { components.queryItems = query }
        guard let url = components.url else { throw APIError.invalidConfiguration }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 60
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        let (data, http) = try await sendRaw(request, authenticated: true)
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? Self.decoder.decode(ErrorEnvelope.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                message: envelope?.detail ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            )
        }
        return data
    }

    private func send<Response: Decodable & Sendable>(
        _ request: URLRequest,
        authenticated: Bool,
        response: Response.Type
    ) async throws -> Response {
        let (data, http) = try await sendRaw(request, authenticated: authenticated)
        guard (200..<300).contains(http.statusCode) else {
            let envelope = try? Self.decoder.decode(ErrorEnvelope.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                message: envelope?.detail ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            )
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

    private func sendRaw(_ original: URLRequest, authenticated: Bool) async throws -> (Data, HTTPURLResponse) {
        var request = original
        if authenticated {
            do {
                if let token = try await credentials.tokenForRequest() {
                    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                }
            } catch APIError.unauthorized {
                onUnauthorized()
                throw APIError.unauthorized
            }
        }
        var (data, rawResponse) = try await perform(request)
        guard let http = rawResponse as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401, authenticated {
            do {
                let refreshed = try await credentials.refresh(force: true)
                request.setValue("Bearer \(refreshed.accessToken)", forHTTPHeaderField: "Authorization")
                (data, rawResponse) = try await perform(request)
            } catch APIError.unauthorized {
                onUnauthorized()
                throw APIError.unauthorized
            }
        }
        guard let finalHTTP = rawResponse as? HTTPURLResponse else { throw APIError.invalidResponse }
        if finalHTTP.statusCode == 401 {
            onUnauthorized()
            throw APIError.unauthorized
        }
        return (data, finalHTTP)
    }

    private static func multipartBody(
        boundary: String,
        fields: [String: String],
        fileField: String,
        filename: String,
        mimeType: String,
        data: Data
    ) -> Data {
        var body = Data()
        let lineBreak = "\r\n"
        for (name, value) in fields {
            body.append("--\(boundary)\(lineBreak)")
            body.append("Content-Disposition: form-data; name=\"\(name)\"\(lineBreak)\(lineBreak)")
            body.append("\(value)\(lineBreak)")
        }
        body.append("--\(boundary)\(lineBreak)")
        body.append("Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(filename)\"\(lineBreak)")
        body.append("Content-Type: \(mimeType)\(lineBreak)\(lineBreak)")
        body.append(data)
        body.append(lineBreak)
        body.append("--\(boundary)--\(lineBreak)")
        return body
    }
}

private struct ErrorEnvelope: Decodable {
    let detail: String?

    private enum CodingKeys: String, CodingKey { case detail }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        detail = try? container.decode(String.self, forKey: .detail)
    }
}

private struct AnyEncodable: Encodable {
    private let encodeValue: (Encoder) throws -> Void
    init(_ value: any Encodable) { encodeValue = value.encode }
    func encode(to encoder: Encoder) throws { try encodeValue(encoder) }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) {
            append(data)
        }
    }
}
