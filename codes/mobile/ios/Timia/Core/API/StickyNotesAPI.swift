import Foundation

/// Thin client for the sticky-note endpoints. All callers go through
/// ``APIClient.request`` so auth + 401 refresh are handled centrally.
struct StickyNotesAPI: Sendable {
    let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    // MARK: - List

    func list(limit: Int = 50, cursor: String? = nil, includeArchived: Bool = false) async throws -> StickyNoteListResponse {
        var query: [URLQueryItem] = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "include_archived", value: includeArchived ? "true" : "false"),
        ]
        if let cursor, !cursor.isEmpty {
            query.append(URLQueryItem(name: "cursor", value: cursor))
        }
        return try await client.request(
            "/sticky-notes",
            method: "GET",
            query: query,
            response: StickyNoteListResponse.self
        )
    }

    // MARK: - Create

    func create(_ payload: StickyNoteCreatePayload) async throws -> StickyNote {
        try await client.request(
            "/sticky-notes",
            method: "POST",
            body: payload,
            response: StickyNote.self
        )
    }

    // MARK: - Single

    func get(id: String) async throws -> StickyNote {
        try await client.request(
            "/sticky-notes/\(id)",
            method: "GET",
            response: StickyNote.self
        )
    }

    func update(id: String, payload: StickyNoteUpdatePayload) async throws -> StickyNote {
        try await client.request(
            "/sticky-notes/\(id)",
            method: "PATCH",
            body: payload,
            response: StickyNote.self
        )
    }

    func archive(id: String) async throws {
        _ = try await client.request(
            "/sticky-notes/\(id)",
            method: "DELETE",
            response: EmptyResponse.self
        )
    }

    // MARK: - AI parse

    func triggerParse(id: String) async throws -> StickyNoteAIParse {
        try await client.request(
            "/sticky-notes/\(id)/ai-parse",
            method: "POST",
            response: StickyNoteAIParse.self
        )
    }

    func latestParse(noteId: String) async throws -> StickyNoteAIParse? {
        let result: [StickyNoteAIParse] = try await client.request(
            "/sticky-notes/\(noteId)/parses",
            method: "GET",
            query: [URLQueryItem(name: "latest", value: "true")],
            response: [StickyNoteAIParse].self
        )
        return result.first
    }

    func allParses(noteId: String) async throws -> [StickyNoteAIParse] {
        try await client.request(
            "/sticky-notes/\(noteId)/parses",
            method: "GET",
            response: [StickyNoteAIParse].self
        )
    }

    // MARK: - Workspaces / Projects (for default workspace/project selection)

    func listWorkspaces() async throws -> [WorkspaceCard] {
        try await client.request("/workspaces/cards", response: [WorkspaceCard].self)
    }

    func listProjects(workspaceId: String) async throws -> [Project] {
        try await client.request("/workspaces/\(workspaceId)/projects", response: [Project].self)
    }

    // MARK: - Tasks

    func getTask(workspaceId: String, projectId: String, taskId: String) async throws -> ScheduleTask {
        try await client.request(
            "/workspaces/\(workspaceId)/projects/\(projectId)/items/\(taskId)",
            method: "GET",
            response: ScheduleTask.self
        )
    }

    // MARK: - Convert

    func convert(noteId: String, payload: StickyNoteConvertPayload) async throws -> StickyNoteConvertResponse {
        try await client.request(
            "/sticky-notes/\(noteId)/convert",
            method: "POST",
            body: payload,
            response: StickyNoteConvertResponse.self
        )
    }
}
