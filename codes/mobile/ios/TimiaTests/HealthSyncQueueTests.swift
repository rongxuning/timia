import XCTest
@testable import Timia

final class HealthSyncQueueTests: XCTestCase {
    func testNextPendingPagesAfterId() async throws {
        let queue = try await makeQueue()
        try await queue.enqueue(category: .samples, localDate: "2026-09-07", payload: Data("s1".utf8))
        try await queue.enqueue(category: .samples, localDate: "2026-09-07", payload: Data("s2".utf8))
        try await queue.enqueue(category: .sleep, localDate: "2026-09-07", payload: Data("sleep".utf8))

        let first = try await queue.nextPending(limit: 1, afterId: 0)
        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(first[0].category, .samples)

        let rest = try await queue.nextPending(limit: 10, afterId: first[0].id)
        XCTAssertEqual(rest.map(\.category), [.samples, .sleep])
    }

    func testRequeueFailedReturnsRowsToPending() async throws {
        let queue = try await makeQueue()
        try await queue.enqueue(category: .samples, localDate: "2026-09-07", payload: Data("s".utf8))
        let row = try await queue.nextPending(limit: 1)[0]
        try await queue.markFailed(id: row.id, attempts: 1)
        let pendingAfterFail = try await queue.pendingCount()
        let failedAfterFail = try await queue.failedCount()
        XCTAssertEqual(pendingAfterFail, 0)
        XCTAssertEqual(failedAfterFail, 1)

        try await queue.requeueFailed()
        let pendingAfterRequeue = try await queue.pendingCount()
        let failedAfterRequeue = try await queue.failedCount()
        XCTAssertEqual(pendingAfterRequeue, 1)
        XCTAssertEqual(failedAfterRequeue, 0)
    }

    private func makeQueue() async throws -> HealthSyncQueue {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("timia.health.outbox.test.\(UUID().uuidString).sqlite")
        addTeardownBlock {
            try? FileManager.default.removeItem(at: url)
        }
        return HealthSyncQueue(dbURL: url)
    }
}
