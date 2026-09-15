import Foundation
import UniformTypeIdentifiers

struct FilesAPI: Sendable {
    static let maxItemBindings = 20
    static let imageMaxBytes = 10 * 1024 * 1024
    static let videoMaxBytes = 200 * 1024 * 1024

    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func listForItem(workspaceId: String, projectId: String, itemId: String) async throws -> [FileOut] {
        let listed: FileListOut = try await client.request(
            "/files",
            query: [
                URLQueryItem(name: "workspace_id", value: workspaceId),
                URLQueryItem(name: "project_id", value: projectId),
                URLQueryItem(name: "binding_type", value: "item"),
                URLQueryItem(name: "binding_id", value: itemId),
                URLQueryItem(name: "limit", value: "100"),
            ],
            response: FileListOut.self
        )
        return listed.items
    }

    func upload(
        data: Data,
        filename: String,
        mimeType: String,
        kind: String,
        workspaceId: String,
        projectId: String,
        itemId: String
    ) async throws -> FileOut {
        try await client.uploadMultipart(
            "/files",
            fields: [
                "kind": kind,
                "workspace_id": workspaceId,
                "project_id": projectId,
                "binding_type": "item",
                "binding_id": itemId,
            ],
            filename: filename,
            mimeType: mimeType,
            data: data,
            response: FileOut.self
        )
    }

    func delete(id: String) async throws {
        _ = try await client.request(
            "/files/\(id)",
            method: "DELETE",
            response: EmptyResponse.self
        )
    }

    func download(path: String) async throws -> Data {
        let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        let filePath = String(parts.first ?? "")
        var query: [URLQueryItem] = []
        if parts.count > 1 {
            query = URLComponents(string: "http://x?\(parts[1])")?.queryItems ?? []
        }
        return try await client.downloadData(filePath, query: query)
    }

    static func kind(for types: [UTType]) -> String {
        if types.contains(where: { $0.conforms(to: .audiovisualContent) }) {
            return "video"
        }
        return "image"
    }

    static func validate(_ data: Data, kind: String) -> String? {
        if kind == "image", data.count > imageMaxBytes { return "图片不能超过 10 MB" }
        if kind == "video", data.count > videoMaxBytes { return "视频不能超过 200 MB" }
        return nil
    }
}
