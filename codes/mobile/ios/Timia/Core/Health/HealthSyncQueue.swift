import Foundation
import SQLite3

enum HealthSyncOutboxCategory: String, Sendable {
    case samples
    case sleep
    case standHours
    case workouts
    case routes
    case heartbeats
    case deletions
}

struct HealthSyncOutboxRow: Sendable, Identifiable {
    var id: Int64
    var category: HealthSyncOutboxCategory
    var localDate: String
    var payload: Data
    var attempts: Int
    /// `pending` | `uploading` | `failed`
    var status: String
}

enum HealthSyncQueueError: Error, LocalizedError {
    case openFailed(String)
    case prepareFailed(String)
    case stepFailed(String)
    case invalidCategory(String)
    case notOpen

    var errorDescription: String? {
        switch self {
        case .openFailed(let message): return "HealthSyncQueue open failed: \(message)"
        case .prepareFailed(let message): return "HealthSyncQueue prepare failed: \(message)"
        case .stepFailed(let message): return "HealthSyncQueue step failed: \(message)"
        case .invalidCategory(let value): return "HealthSyncQueue invalid category: \(value)"
        case .notOpen: return "HealthSyncQueue database is not open"
        }
    }
}

/// Durable SQLite outbox for health sync batches. Drain/upload wiring is Task 6.
actor HealthSyncQueue {
    static let shared = HealthSyncQueue()

    private static let fileName = "timia.health.outbox.sqlite"
    private static let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

    private let dbURL: URL
    private var db: OpaquePointer?

    init(dbURL: URL? = nil) {
        if let dbURL {
            self.dbURL = dbURL
        } else {
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            self.dbURL = support.appendingPathComponent(Self.fileName, isDirectory: false)
        }
    }

    deinit {
        if let db {
            sqlite3_close(db)
        }
    }

    // MARK: - Public API

    func enqueue(category: HealthSyncOutboxCategory, localDate: String, payload: Data) throws {
        try openIfNeeded()
        let sql = """
            INSERT INTO outbox (category, local_date, payload, attempts, status, created_at)
            VALUES (?, ?, ?, 0, 'pending', ?);
            """
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }

        sqlite3_bind_text(stmt, 1, category.rawValue, -1, Self.SQLITE_TRANSIENT)
        sqlite3_bind_text(stmt, 2, localDate, -1, Self.SQLITE_TRANSIENT)
        payload.withUnsafeBytes { raw in
            let ptr = raw.baseAddress.map { UnsafeRawPointer($0) }
            sqlite3_bind_blob(stmt, 3, ptr, Int32(payload.count), Self.SQLITE_TRANSIENT)
        }
        sqlite3_bind_double(stmt, 4, Date().timeIntervalSince1970)

        try stepDone(stmt)
    }

    func nextPending(limit: Int) throws -> [HealthSyncOutboxRow] {
        try openIfNeeded()
        let capped = max(0, limit)
        let sql = """
            SELECT id, category, local_date, payload, attempts, status
            FROM outbox
            WHERE status = 'pending'
            ORDER BY id ASC
            LIMIT ?;
            """
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, Int32(capped))

        var rows: [HealthSyncOutboxRow] = []
        while true {
            let code = sqlite3_step(stmt)
            if code == SQLITE_DONE { break }
            guard code == SQLITE_ROW else {
                throw HealthSyncQueueError.stepFailed(lastErrorMessage())
            }
            rows.append(try row(from: stmt))
        }
        return rows
    }

    func markUploading(ids: [Int64]) throws {
        guard !ids.isEmpty else { return }
        try openIfNeeded()
        try withTransaction {
            let sql = "UPDATE outbox SET status = 'uploading' WHERE id = ?;"
            let stmt = try prepare(sql)
            defer { sqlite3_finalize(stmt) }
            for id in ids {
                sqlite3_reset(stmt)
                sqlite3_clear_bindings(stmt)
                sqlite3_bind_int64(stmt, 1, id)
                try stepDone(stmt)
            }
        }
    }

    func acknowledge(ids: [Int64]) throws {
        guard !ids.isEmpty else { return }
        try openIfNeeded()
        try withTransaction {
            let sql = "DELETE FROM outbox WHERE id = ?;"
            let stmt = try prepare(sql)
            defer { sqlite3_finalize(stmt) }
            for id in ids {
                sqlite3_reset(stmt)
                sqlite3_clear_bindings(stmt)
                sqlite3_bind_int64(stmt, 1, id)
                try stepDone(stmt)
            }
        }
    }

    func markFailed(id: Int64, attempts: Int) throws {
        try openIfNeeded()
        let sql = "UPDATE outbox SET status = 'failed', attempts = ? WHERE id = ?;"
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, Int32(attempts))
        sqlite3_bind_int64(stmt, 2, id)
        try stepDone(stmt)
    }

    /// Return a row to `pending` after a retryable failure (transport / 5xx).
    func requeue(id: Int64, attempts: Int) throws {
        try openIfNeeded()
        let sql = "UPDATE outbox SET status = 'pending', attempts = ? WHERE id = ?;"
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int(stmt, 1, Int32(attempts))
        sqlite3_bind_int64(stmt, 2, id)
        try stepDone(stmt)
    }

    /// Recover rows left in `uploading` after process death so drain can resume.
    func resetUploadingToPending() throws {
        try openIfNeeded()
        try exec("UPDATE outbox SET status = 'pending' WHERE status = 'uploading';")
    }

    /// True when a workouts row would block uploading this route (earlier id or same/earlier local_date).
    func hasBlockingWorkouts(forRouteId routeId: Int64, localDate: String) throws -> Bool {
        try openIfNeeded()
        let sql = """
            SELECT 1 FROM outbox
            WHERE category = 'workouts'
              AND status IN ('pending', 'uploading')
              AND (id < ? OR local_date <= ?)
            LIMIT 1;
            """
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_int64(stmt, 1, routeId)
        sqlite3_bind_text(stmt, 2, localDate, -1, Self.SQLITE_TRANSIENT)
        let code = sqlite3_step(stmt)
        if code == SQLITE_ROW { return true }
        if code == SQLITE_DONE { return false }
        throw HealthSyncQueueError.stepFailed(lastErrorMessage())
    }

    /// Rows still in the outbox (ACK deletes). Includes pending / uploading / failed.
    func pendingCount() throws -> Int {
        try openIfNeeded()
        return try scalarInt("SELECT COUNT(*) FROM outbox;")
    }

    /// Remaining rows for a local calendar day — used to gate day checkpoints.
    func pendingCount(localDate: String) throws -> Int {
        try openIfNeeded()
        let sql = "SELECT COUNT(*) FROM outbox WHERE local_date = ?;"
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        sqlite3_bind_text(stmt, 1, localDate, -1, Self.SQLITE_TRANSIENT)
        guard sqlite3_step(stmt) == SQLITE_ROW else {
            throw HealthSyncQueueError.stepFailed(lastErrorMessage())
        }
        return Int(sqlite3_column_int(stmt, 0))
    }

    func clearAll() throws {
        try openIfNeeded()
        try exec("DELETE FROM outbox;")
    }

    // MARK: - DEBUG self-check

    #if DEBUG
    /// Enqueue → nextPending → acknowledge → pendingCount == 0 against an in-memory-style temp file.
    static func runSelfCheck() async throws {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("timia.health.outbox.selfcheck.\(UUID().uuidString).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }

        let queue = HealthSyncQueue(dbURL: url)
        let payload = Data(#"{"ok":true}"#.utf8)
        try await queue.enqueue(category: .samples, localDate: "2026-09-05", payload: payload)
        let pending = try await queue.nextPending(limit: 10)
        guard pending.count == 1,
              pending[0].category == .samples,
              pending[0].localDate == "2026-09-05",
              pending[0].payload == payload,
              pending[0].status == "pending"
        else {
            throw HealthSyncQueueError.stepFailed("self-check nextPending mismatch")
        }
        try await queue.markUploading(ids: [pending[0].id])
        try await queue.acknowledge(ids: [pending[0].id])
        let count = try await queue.pendingCount()
        guard count == 0 else {
            throw HealthSyncQueueError.stepFailed("self-check pendingCount expected 0, got \(count)")
        }
    }
    #endif

    // MARK: - SQLite helpers

    private func openIfNeeded() throws {
        if db != nil { return }

        let dir = dbURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        var handle: OpaquePointer?
        let flags = SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX
        let openCode = dbURL.path.withCString { path in
            sqlite3_open_v2(path, &handle, flags, nil)
        }
        guard openCode == SQLITE_OK, let handle else {
            let message = handle.map { String(cString: sqlite3_errmsg($0)) } ?? "unknown"
            if let handle { sqlite3_close(handle) }
            throw HealthSyncQueueError.openFailed(message)
        }
        db = handle

        try exec("PRAGMA journal_mode=WAL;")
        try exec("PRAGMA synchronous=NORMAL;")
        try exec("""
            CREATE TABLE IF NOT EXISTS outbox (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              category TEXT NOT NULL,
              local_date TEXT NOT NULL,
              payload BLOB NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              status TEXT NOT NULL DEFAULT 'pending',
              created_at REAL NOT NULL
            );
            """)
        try exec("CREATE INDEX IF NOT EXISTS ix_outbox_status_id ON outbox(status, id);")
        try exec("CREATE INDEX IF NOT EXISTS ix_outbox_local_date ON outbox(local_date, status);")
    }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        guard let db else { throw HealthSyncQueueError.notOpen }
        var stmt: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK, let stmt else {
            throw HealthSyncQueueError.prepareFailed(lastErrorMessage())
        }
        return stmt
    }

    private func exec(_ sql: String) throws {
        guard let db else { throw HealthSyncQueueError.notOpen }
        var errMsg: UnsafeMutablePointer<CChar>?
        let code = sqlite3_exec(db, sql, nil, nil, &errMsg)
        if code != SQLITE_OK {
            let message = errMsg.map { String(cString: $0) } ?? lastErrorMessage()
            sqlite3_free(errMsg)
            throw HealthSyncQueueError.stepFailed(message)
        }
    }

    private func stepDone(_ stmt: OpaquePointer?) throws {
        let code = sqlite3_step(stmt)
        guard code == SQLITE_DONE else {
            throw HealthSyncQueueError.stepFailed(lastErrorMessage())
        }
    }

    private func withTransaction(_ body: () throws -> Void) throws {
        try exec("BEGIN IMMEDIATE;")
        do {
            try body()
            try exec("COMMIT;")
        } catch {
            try? exec("ROLLBACK;")
            throw error
        }
    }

    private func scalarInt(_ sql: String) throws -> Int {
        let stmt = try prepare(sql)
        defer { sqlite3_finalize(stmt) }
        guard sqlite3_step(stmt) == SQLITE_ROW else {
            throw HealthSyncQueueError.stepFailed(lastErrorMessage())
        }
        return Int(sqlite3_column_int(stmt, 0))
    }

    private func row(from stmt: OpaquePointer?) throws -> HealthSyncOutboxRow {
        let id = sqlite3_column_int64(stmt, 0)
        guard let categoryPtr = sqlite3_column_text(stmt, 1) else {
            throw HealthSyncQueueError.invalidCategory("<null>")
        }
        let categoryRaw = String(cString: categoryPtr)
        guard let category = HealthSyncOutboxCategory(rawValue: categoryRaw) else {
            throw HealthSyncQueueError.invalidCategory(categoryRaw)
        }
        guard let localDatePtr = sqlite3_column_text(stmt, 2) else {
            throw HealthSyncQueueError.stepFailed("null local_date")
        }
        let localDate = String(cString: localDatePtr)
        let payload: Data
        if let blob = sqlite3_column_blob(stmt, 3) {
            let length = Int(sqlite3_column_bytes(stmt, 3))
            payload = Data(bytes: blob, count: length)
        } else {
            payload = Data()
        }
        let attempts = Int(sqlite3_column_int(stmt, 4))
        guard let statusPtr = sqlite3_column_text(stmt, 5) else {
            throw HealthSyncQueueError.stepFailed("null status")
        }
        let status = String(cString: statusPtr)
        return HealthSyncOutboxRow(
            id: id,
            category: category,
            localDate: localDate,
            payload: payload,
            attempts: attempts,
            status: status
        )
    }

    private func lastErrorMessage() -> String {
        guard let db else { return "database not open" }
        return String(cString: sqlite3_errmsg(db))
    }
}
