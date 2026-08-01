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

    func testTodoStatusUpdateClearsCompletionWhenTaskReturnsToTodo() throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let data = try encoder.encode(
            TodoTaskStatusUpdatePayload(version: 7, status: "todo", completedAt: nil)
        )
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["version"] as? Int, 7)
        XCTAssertEqual(json["status"] as? String, "todo")
        XCTAssertTrue(json["completed_at"] is NSNull)
    }

    func testTodoStatusUpdateSendsCompletionTimestampWhenTaskIsDone() throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let timestamp = "2026-08-01T12:00:00Z"
        let data = try encoder.encode(
            TodoTaskStatusUpdatePayload(version: 3, status: "done", completedAt: timestamp)
        )
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["completed_at"] as? String, timestamp)
    }

    func testItemUpdateEncodesTimesPeopleAndCanClearAssignee() throws {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        let startAt = "2026-08-03T01:30:00Z"
        let endAt = "2026-08-03T03:00:00Z"
        let data = try encoder.encode(
            ItemUpdatePayload(
                version: 4,
                title: "任务",
                body: nil,
                color: "#FFFFFF",
                status: "todo",
                priority: "2",
                startAt: startAt,
                endAt: endAt,
                completedAt: nil,
                details: nil,
                assigneeUserId: nil,
                participantUserIds: ["user-2", "user-3"],
                location: nil,
                targetWorkspaceId: "workspace-2",
                targetProjectId: "project-2"
            )
        )
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertTrue(json["assignee_user_id"] is NSNull)
        XCTAssertTrue(json["completed_at"] is NSNull)
        XCTAssertEqual(json["start_at"] as? String, startAt)
        XCTAssertEqual(json["end_at"] as? String, endAt)
        XCTAssertEqual(json["participant_user_ids"] as? [String], ["user-2", "user-3"])
        XCTAssertEqual(json["target_workspace_id"] as? String, "workspace-2")
        XCTAssertEqual(json["target_project_id"] as? String, "project-2")
    }

    func testItemDetailDecodesAssigneeAndParticipantsForEditing() throws {
        let json = """
        {
          "workspace_id": "workspace-1", "project_id": "project-1", "id": "task-1",
          "title": "任务", "color": "#FFFFFF", "status": "done", "priority": "2", "version": 5,
          "completed_at": "2026-08-02T08:30:00Z",
          "created_by": {"id": "user-1", "display_name": "创建人"},
          "assignee": {"id": "user-2", "display_name": "负责人"},
          "participants": [{"id": "user-3", "display_name": "成员"}],
          "comments": []
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let detail = try decoder.decode(ItemDetail.self, from: Data(json.utf8))

        XCTAssertEqual(detail.assignee?.id, "user-2")
        XCTAssertEqual(detail.participants?.map(\.id), ["user-3"])
        XCTAssertEqual(detail.completedAt, "2026-08-02T08:30:00Z")
    }

    func testNaturalLanguageResponseDecodesTaskEditorPrefillFields() throws {
        let json = """
        {
          "draft": {
            "title": "周会准备",
            "body": "整理本周进展",
            "start_at": "2026-08-03T01:00:00Z",
            "end_at": "2026-08-03T02:00:00Z",
            "all_day": false,
            "status": "todo",
            "priority": "3",
            "location": "会议室 A",
            "workspace_name": "产品研发",
            "project_name": "iOS",
            "assignee_name": "负责人",
            "participant_names": ["成员甲", "成员乙"],
            "recurrence_text": "每周一"
          },
          "confidence": 0.92,
          "assumptions": ["按当前时区解析"],
          "missing_fields": ["具体材料"],
          "ambiguities": ["会议室可能需要确认"]
        }
        """
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let response = try decoder.decode(NaturalLanguageParseResponse.self, from: Data(json.utf8))

        XCTAssertEqual(response.draft.title, "周会准备")
        XCTAssertEqual(response.draft.workspaceName, "产品研发")
        XCTAssertEqual(response.draft.projectName, "iOS")
        XCTAssertEqual(response.draft.assigneeName, "负责人")
        XCTAssertEqual(response.draft.participantNames, ["成员甲", "成员乙"])
        XCTAssertEqual(response.draft.priority, "3")
        XCTAssertEqual(response.confidence, 0.92, accuracy: 0.001)
        XCTAssertEqual(response.assumptions, ["按当前时区解析"])
        XCTAssertEqual(response.missingFields, ["具体材料"])
        XCTAssertEqual(response.ambiguities, ["会议室可能需要确认"])
    }

    func testTimelineOverlapLayoutPlacesIntersectingTasksSideBySide() {
        let lanes = TimelineOverlapLayout.lanes(for: [
            .init(id: "task-a", dayIndex: 0, startMinutes: 9 * 60, durationMinutes: 120),
            .init(id: "task-b", dayIndex: 0, startMinutes: 9 * 60 + 30, durationMinutes: 60),
            .init(id: "task-c", dayIndex: 0, startMinutes: 12 * 60, durationMinutes: 60)
        ])

        XCTAssertEqual(lanes["task-a"], .init(index: 0, count: 2))
        XCTAssertEqual(lanes["task-b"], .init(index: 1, count: 2))
        XCTAssertEqual(lanes["task-c"], .init(index: 0, count: 1))
    }

    func testTimelineOverlapLayoutReusesLaneAtIntervalBoundaryAndSeparatesDays() {
        let lanes = TimelineOverlapLayout.lanes(for: [
            .init(id: "day-one-a", dayIndex: 0, startMinutes: 9 * 60, durationMinutes: 30),
            .init(id: "day-one-b", dayIndex: 0, startMinutes: 9 * 60 + 30, durationMinutes: 30),
            .init(id: "day-two-a", dayIndex: 1, startMinutes: 9 * 60, durationMinutes: 60)
        ])

        XCTAssertEqual(lanes["day-one-a"], .init(index: 0, count: 1))
        XCTAssertEqual(lanes["day-one-b"], .init(index: 0, count: 1))
        XCTAssertEqual(lanes["day-two-a"], .init(index: 0, count: 1))
    }
}
