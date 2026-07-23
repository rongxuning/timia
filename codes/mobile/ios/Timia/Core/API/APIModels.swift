import Foundation

struct TokenResponse: Decodable, Sendable {
    let accessToken: String
}

struct CurrentUser: Codable, Equatable, Sendable {
    let id: String
    let email: String
    let displayName: String
    let systemRole: String

    var isSystemAdmin: Bool { systemRole == "admin" || systemRole == "system_admin" }
}

struct LoginRequest: Encodable, Sendable {
    let email: String
    let password: String
}

struct RegisterRequest: Encodable, Sendable {
    let email: String
    let displayName: String
    let password: String
}

struct ScheduleDashboard: Decodable, Sendable {
    let taskTotal: Int
    let todoCount: Int
    let doingCount: Int
    let doneCount: Int
    let archivedCount: Int
    let healthPercent: Int?
    let displayName: String
    let email: String
    let workspaceCount: Int
    let projectCount: Int
    let todayTodoCount: Int
    let overdueCount: Int
    let dueThisWeekCount: Int
}

struct UserBrief: Codable, Hashable, Sendable {
    let id: String
    let displayName: String
}

struct ScheduleTask: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var title: String
    var body: String?
    var color: String
    var status: String
    var priority: String?
    var startAt: String?
    var endAt: String?
    var completedAt: String?
    var details: String?
    var version: Int
    var createdBy: UserBrief?
    var assignee: UserBrief?
    var participants: [UserBrief]?
    var location: String?
    var workspaceId: String
    var workspaceName: String
    var projectId: String
    var projectName: String
}

struct CalendarDay: Decodable, Identifiable, Sendable {
    let key: String
    let day: Int
    let inMonth: Bool
    var id: String { key }
}

struct CalendarSegment: Decodable, Identifiable, Sendable {
    let item: ScheduleTask
    let colStart: Int
    let colSpan: Int
    let lane: Int
    let roundLeft: Bool
    let roundRight: Bool
    var id: String { "\(item.id)-\(colStart)-\(lane)" }
}

struct CalendarWeek: Decodable, Sendable {
    let days: [CalendarDay]
    let segments: [CalendarSegment]
}

struct CalendarDayDetail: Decodable, Sendable {
    let key: String
    let weekday: Int
    let items: [ScheduleTask]
}

struct ScheduleCalendar: Decodable, Sendable {
    let view: String
    let anchor: String
    let month: String?
    let weeks: [CalendarWeek]?
    let day: CalendarDayDetail?
}

struct ScheduleColumns: Decodable, Sendable {
    let columns: [String: [ScheduleTask]]
}

struct ScheduleQuadrants: Decodable, Sendable {
    let quadrants: [String: [ScheduleTask]]
}

struct WorkspacePerson: Decodable, Hashable, Sendable {
    let id: String
    let email: String
    let displayName: String
    let role: String
    let status: String
}

struct WorkspaceCard: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var description: String?
    var color: String
    let createdAt: String
    var projectCount: Int
    var todoCount: Int
    var doingCount: Int
    var doneCount: Int
    var archivedCount: Int
    var owners: [WorkspacePerson]
    var members: [WorkspacePerson]
    var myWorkspaceRole: String
    var isFavorite: Bool
}

struct WorkspacePayload: Encodable, Sendable {
    let name: String
    let description: String?
    let color: String
}

struct WorkspaceResponse: Decodable, Sendable {
    let id: String
    let name: String
    let description: String?
    let color: String?
}

struct FavoritePayload: Encodable, Sendable { let isFavorite: Bool }

struct Project: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let workspaceId: String
    var name: String
    var description: String?
    var color: String
    var archived: Bool
    let createdAt: String
    var createdByUserId: String?
    var createdByDisplayName: String?
    var canManage: Bool
}

struct WorkspaceProjectCard: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    var name: String
    var description: String?
    var color: String
    let createdAt: String
    var isFavorite: Bool
    var canManage: Bool
    var todoDoing: Int
    var doneArchived: Int
    var progressPercent: Int

    func asProject(workspaceId: String) -> Project {
        Project(
            id: id,
            workspaceId: workspaceId,
            name: name,
            description: description,
            color: color,
            archived: false,
            createdAt: createdAt,
            createdByUserId: nil,
            createdByDisplayName: nil,
            canManage: canManage
        )
    }
}

struct WorkspaceDashboard: Decodable, Sendable {
    let activeProjects: [WorkspaceProjectCard]
}

struct ProjectPayload: Encodable, Sendable {
    let name: String
    let description: String?
    let color: String
}

struct ItemPayload: Encodable, Sendable {
    let title: String
    let body: String?
    let color: String
    let status: String
    let priority: String
    let startAt: String?
    let endAt: String?
    let details: String?
    let location: String?
}

struct ItemUpdatePayload: Encodable, Sendable {
    let version: Int
    let title: String
    let body: String?
    let color: String
    let status: String
    let priority: String
    let startAt: String?
    let endAt: String?
    let details: String?
    let location: String?
}

struct ItemResponse: Decodable, Identifiable, Sendable {
    let id: String
    let title: String
    let body: String?
    let color: String
    let status: String
    let priority: String?
    let startAt: String?
    let endAt: String?
    let details: String?
    let version: Int
    let location: String?
}

struct TaskComment: Decodable, Identifiable, Sendable {
    let id: String
    let authorUserId: String
    let authorDisplayName: String
    let body: String
    let createdAt: String
    let createdAtLabel: String
    let completionStatus: String
    let isAuthor: Bool
}

struct ItemDetail: Decodable, Sendable {
    let workspaceId: String
    let projectId: String
    let id: String
    let title: String
    let body: String?
    let color: String
    let status: String
    let priority: String?
    let startAt: String?
    let endAt: String?
    let details: String?
    let version: Int
    let location: String?
    let comments: [TaskComment]?
}

struct CommentPayload: Encodable, Sendable {
    let body: String
    let parentCommentId: String?
}

struct CommentResponse: Decodable, Sendable {
    let id: String
    let body: String
}

struct UserDirectory: Decodable, Sendable {
    let userTotal: Int
    let usersWithWorkspace: Int
    let unassignedUserCount: Int
    let workspaceAssignmentsTotal: Int
    let users: [DirectoryUser]
}

struct DirectoryUser: Decodable, Identifiable, Sendable {
    let id: String
    let email: String
    let displayName: String
    let status: String
    let systemRole: String
    let workspaceCount: Int
    let createdAtLabel: String?
}

struct UserMembershipDetail: Decodable, Sendable {
    let userId: String
    let workspaces: [MembershipWorkspace]
}

struct MembershipWorkspace: Decodable, Identifiable, Sendable {
    let workspaceId: String
    let workspaceName: String
    let membershipId: String
    let role: String
    let status: String
    let projectCount: Int
    let projects: [MembershipProject]
    var id: String { workspaceId }
}

struct MembershipProject: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let archived: Bool
}

struct AssignableUser: Decodable, Identifiable, Sendable {
    let userId: String
    let email: String
    let displayName: String
    var id: String { userId }
}

struct MembershipRow: Decodable, Identifiable, Sendable {
    let id: String
    let userId: String
    let email: String
    let displayName: String
    let role: String
    let status: String
    let isCreator: Bool
}

struct WorkspaceMembersPage: Decodable, Sendable {
    let workspaceId: String
    let name: String
    let description: String?
    let createdByUserId: String?
    let currentUserId: String
    let canManageWorkspace: Bool
    let members: [MembershipRow]
    let assignableUsers: [AssignableUser]
}

struct ProjectMembersPage: Decodable, Sendable {
    let workspaceId: String
    let projectId: String
    let projectName: String
    let createdByUserId: String?
    let canManageProject: Bool
    let projectMembers: [MembershipRow]
    let workspaceMemberPool: [AssignableUser]
}

struct MemberAddPayload: Encodable, Sendable {
    let userId: String
    let role: String
}

struct MemberRolePayload: Encodable, Sendable { let role: String }

struct WorkspaceActivity: Decodable, Sendable {
    let workspaceId: String
    let name: String
    let description: String?
    let totalCount: Int
    let latestAtLabel: String?
    let items: [ActivityItem]
}

struct ActivityItem: Decodable, Identifiable, Sendable {
    let id: String
    let actorUserId: String
    let actorUserIdShort: String
    let entityType: String
    let entityTypeLabel: String
    let entityId: String
    let entityIdShort: String
    let action: String
    let createdAt: String
    let createdAtLabel: String
}

struct WorkspaceDiscussions: Decodable, Sendable {
    let items: [DiscussionItem]
    let hasMore: Bool
}

struct DiscussionItem: Decodable, Identifiable, Sendable {
    let id: String
    let body: String
    let createdAt: String
    let createdAtExactLabel: String
    let createdAgoLabel: String
    let authorUserId: String
    let authorDisplayName: String
    let isReply: Bool
    var completionStatus: String
    let isAuthor: Bool
    let projectId: String
    let projectName: String
    let itemId: String
    let itemTitle: String
}

struct CommentStatusPayload: Encodable, Sendable { let completionStatus: String }
