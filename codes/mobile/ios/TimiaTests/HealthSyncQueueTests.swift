import XCTest
@testable import Timia

final class HealthSyncQueueTests: XCTestCase {
    func testNextPendingPagesAfterId() async throws {
        let queue = try await makeQueue()
        try await queue.enqueue(category: .routes, localDate: "2026-09-07", payload: Data("r1".utf8))
        try await queue.enqueue(category: .routes, localDate: "2026-09-07", payload: Data("r2".utf8))
        try await queue.enqueue(category: .workouts, localDate: "2026-09-07", payload: Data("w1".utf8))

        let first = try await queue.nextPending(limit: 1, afterId: 0)
        XCTAssertEqual(first.count, 1)
        XCTAssertEqual(first[0].category, .routes)

        let rest = try await queue.nextPending(limit: 10, afterId: first[0].id)
        XCTAssertEqual(rest.map(\.category), [.routes, .workouts])
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

    func testBlockingWorkoutsDoNotHideLaterWorkoutsInScan() async throws {
        let queue = try await makeQueue()
        // Oldest pending rows are blocked routes; workout is enqueued later (higher id).
        for index in 0 ..< 80 {
            try await queue.enqueue(
                category: .routes,
                localDate: "2026-09-07",
                payload: Data("route-\(index)".utf8)
            )
        }
        try await queue.enqueue(category: .workouts, localDate: "2026-09-07", payload: Data("w".utf8))
        let pending = try await queue.pendingCount()
        XCTAssertEqual(pending, 81)

        let firstPage = try await queue.nextPending(limit: 64, afterId: 0)
        XCTAssertTrue(firstPage.allSatisfy { $0.category == .routes })
        let after = try await queue.nextPending(limit: 64, afterId: firstPage.last!.id)
        XCTAssertTrue(after.contains { $0.category == .workouts })
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
