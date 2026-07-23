import XCTest
@testable import Timia

final class APIModelsTests: XCTestCase {
    func testWorkspaceCardDecodesSnakeCaseContract() throws {
        let json = """
        {
          "id": "workspace-1",
          "name": "产品研发",
          "description": null,
          "color": "#FFFFFF",
          "created_at": "2026-07-20T10:00:00Z",
          "project_count": 2,
          "todo_count": 3,
          "doing_count": 1,
          "done_count": 4,
          "archived_count": 0,
          "owners": [],
          "members": [],
          "my_workspace_role": "owner",
          "is_favorite": true
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let value = try decoder.decode(WorkspaceCard.self, from: Data(json.utf8))
        XCTAssertEqual(value.name, "产品研发")
        XCTAssertTrue(value.isFavorite)
        XCTAssertEqual(value.todoCount, 3)
    }

    func testAPIErrorHasUserFacingMessage() {
        XCTAssertEqual(APIError.unauthorized.errorDescription, "登录已过期，请重新登录")
    }

    func testWorkspaceMembersPageDecodesPermissionsAndPools() throws {
        let json = """
        {
          "workspace_id": "workspace-1",
          "name": "产品研发",
          "description": null,
          "created_by_user_id": "user-1",
          "current_user_id": "user-1",
          "can_manage_workspace": true,
          "members": [{
            "id": "member-1", "user_id": "user-1", "email": "owner@timia.online",
            "display_name": "负责人", "role": "owner", "status": "active", "is_creator": true
          }],
          "assignable_users": [{"user_id": "user-2", "email": "member@timia.online", "display_name": "成员"}]
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let value = try decoder.decode(WorkspaceMembersPage.self, from: Data(json.utf8))
        XCTAssertTrue(value.canManageWorkspace)
        XCTAssertTrue(value.members[0].isCreator)
        XCTAssertEqual(value.assignableUsers[0].userId, "user-2")
    }

    func testCalendarDecodesWeekSegments() throws {
        let json = """
        {
          "view": "week", "anchor": "2026-07-20", "month": "2026-07",
          "weeks": [{
            "days": [{"key": "2026-07-19", "day": 19, "in_month": true}],
            "segments": [{
              "item": {
                "id": "task-1", "title": "设计评审", "color": "#FFFFFF", "status": "todo",
                "version": 1, "workspace_id": "workspace-1", "workspace_name": "产品研发",
                "project_id": "project-1", "project_name": "iOS"
              },
              "col_start": 1, "col_span": 1, "lane": 0, "round_left": true, "round_right": true
            }]
          }],
          "day": null
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let value = try decoder.decode(ScheduleCalendar.self, from: Data(json.utf8))
        XCTAssertEqual(value.weeks?.first?.segments.first?.item.title, "设计评审")
    }
}
