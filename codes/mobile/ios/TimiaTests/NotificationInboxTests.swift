import XCTest
@testable import Timia

final class NotificationInboxTests: XCTestCase {
    func testFormatsAPNsDeviceTokenAsLowercaseHex() {
        XCTAssertEqual(APNsDeviceToken.hexString(from: Data([0x0A, 0xFF, 0x10])), "0aff10")
        XCTAssertEqual(APNsDeviceToken.hexString(from: Data()), "")
        XCTAssertEqual(APNsDeviceToken.environment, "sandbox")
    }

    func testParsesWebTaskProjectAndWorkspaceLinks() {
        XCTAssertEqual(
            NotificationLinkParser.parse("/workspace/ws/projects/proj/items/item"),
            .task(workspaceId: "ws", projectId: "proj", itemId: "item")
        )
        XCTAssertEqual(
            NotificationLinkParser.parse("/workspaces/ws/projects/proj"),
            .project(workspaceId: "ws", projectId: "proj")
        )
        XCTAssertEqual(
            NotificationLinkParser.parse("/workspace/ws?from=inbox"),
            .workspace(workspaceId: "ws")
        )
    }

    func testRejectsExternalAndEmptyLinks() {
        XCTAssertNil(NotificationLinkParser.parse(nil))
        XCTAssertNil(NotificationLinkParser.parse(""))
        XCTAssertNil(NotificationLinkParser.parse("//workspace/ws"))
        XCTAssertNil(NotificationLinkParser.parse("https://timia.online/workspace/ws"))
        XCTAssertNil(NotificationLinkParser.parse("/workspace/ws/projects/proj/items"))
    }

    func testNotificationBaseURLFollowsCoreServiceHost() {
        let core = URL(string: "http://127.0.0.1:8080/core-service")!
        let resolved = NotificationServiceURL.resolve(configured: nil, apiBaseURL: core)
        XCTAssertEqual(resolved.absoluteString, "http://127.0.0.1:8080/notification-service")

        let production = URL(string: "https://timia.online/core-service")!
        let configured = NotificationServiceURL.resolve(
            configured: " https://timia.online/notification-service ",
            apiBaseURL: production
        )
        XCTAssertEqual(configured.absoluteString, "https://timia.online/notification-service")
    }

    func testInboxItemDecodesWebFields() throws {
        let json = """
        {
          "items": [
            {
              "id": "delivery-1",
              "notification_id": "note-1",
              "title": "你被加入了任务",
              "body": "alice 将你加入了「写方案」的参与人",
              "sender_user_id": "user-1",
              "sender_display_name": "alice",
              "link": "/workspace/ws/projects/proj/items/item",
              "scenario_key": "task_member_added",
              "read_at": null,
              "created_at": "2026-10-26T08:30:00Z",
              "push_status": "skipped"
            }
          ],
          "unread_count": 2
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let page = try decoder.decode(NotificationInboxPage.self, from: Data(json.utf8))
        XCTAssertEqual(page.unreadCount, 2)
        let item = try XCTUnwrap(page.items.first)
        XCTAssertEqual(item.title, "你被加入了任务")
        XCTAssertEqual(item.senderLabel, "alice")
        XCTAssertTrue(item.isUnread)
        XCTAssertEqual(item.link, "/workspace/ws/projects/proj/items/item")
        XCTAssertEqual(
            NotificationTimeText.parse(item.createdAt),
            Date(timeIntervalSince1970: 1_793_003_400)
        )
    }

    func testSystemSenderWhenDisplayNameMissing() throws {
        let json = """
        {
          "id": "delivery-2",
          "notification_id": "note-2",
          "title": "系统通知",
          "body": "",
          "sender_user_id": null,
          "sender_display_name": "  ",
          "link": null,
          "scenario_key": null,
          "read_at": "2026-10-26T09:00:00+00:00",
          "created_at": "2026-10-26T08:00:00.120000Z",
          "push_status": "skipped"
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let item = try decoder.decode(InboxNotification.self, from: Data(json.utf8))
        XCTAssertEqual(item.senderLabel, "系统")
        XCTAssertFalse(item.isUnread)
        XCTAssertNotNil(NotificationTimeText.parse(item.createdAt))
        XCTAssertNotNil(NotificationTimeText.parse(item.readAt ?? ""))
    }
}
