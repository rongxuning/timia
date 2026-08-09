import Foundation

struct TokenResponse: Decodable, Sendable {
    let accessToken: String
}

struct MobileChallengeResponse: Decodable, Sendable {
    let challengeId: String
    let nonce: String
}

struct MobileTokenResponse: Decodable, Sendable {
    let accessToken: String
    let expiresIn: Int
    let refreshToken: String
    let sessionId: String
}

struct MobileChallengeRequest: Encodable, Sendable {
    let installationId: String
    let purpose: String
}

struct MobileRefreshChallengeRequest: Encodable, Sendable {
    let installationId: String
    let sessionId: String
}

struct MobileDeviceRegisterRequest: Encodable, Sendable {
    let installationId: String
    let challengeId: String
    let nonce: String
    let publicKey: String
    let signature: String
    let deviceName: String
    let osVersion: String
    let appVersion: String
}

struct MobileDeviceResponse: Decodable, Sendable {
    let deviceId: String
}

struct MobilePasswordLoginRequest: Encodable, Sendable {
    let email: String
    let password: String
    let installationId: String
    let challengeId: String
    let nonce: String
    let signature: String
}

struct MobileTokenExchangeRequest: Encodable, Sendable {
    let installationId: String
    let challengeId: String
    let nonce: String
    let signature: String
}

struct MobileRefreshRequest: Encodable, Sendable {
    let sessionId: String
    let installationId: String
    let refreshToken: String
    let requestId: String
    let challengeId: String
    let nonce: String
    let signature: String
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

struct ScheduleTask: Codable, Identifiable, Hashable, Equatable, Sendable {
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

struct CalendarHeatDay: Decodable, Identifiable, Sendable {
    let key: String
    let taskCount: Int
    var id: String { key }
}

struct CalendarMonthSummary: Decodable, Identifiable, Sendable {
    let month: Int
    let taskCount: Int
    let todoCount: Int
    let doneCount: Int
    let days: [CalendarHeatDay]
    var id: Int { month }
}

struct ScheduleCalendar: Decodable, Sendable {
    let view: String
    let anchor: String
    let month: String?
    let year: Int?
    let weeks: [CalendarWeek]?
    let months: [CalendarMonthSummary]?
    let day: CalendarDayDetail?
}

struct NaturalLanguageParsePayload: Encodable, Sendable {
    let text: String
    let timezone: String
    let referenceTime: String
    let selectedDate: String
}

struct NaturalLanguageTaskDraft: Codable, Hashable, Equatable, Sendable {
    var title: String
    var body: String?
    var startAt: String?
    var endAt: String?
    var allDay: Bool
    var status: String
    var priority: String
    var location: String?
    var workspaceName: String?
    var projectName: String?
    var assigneeName: String?
    var participantNames: [String]
    var recurrenceText: String?
}

struct NaturalLanguageParseResponse: Decodable, Identifiable, Equatable, Sendable {
    let draft: NaturalLanguageTaskDraft
    let confidence: Double
    let assumptions: [String]
    let missingFields: [String]
    let ambiguities: [String]
    var id: String { "\(draft.title)|\(draft.startAt ?? "")" }
}

struct ScheduleColumns: Decodable, Sendable {
    let columns: [String: [ScheduleTask]]
    let totals: [String: Int]
    let hasMore: [String: Bool]
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
    let completedAt: String?
    let details: String?
    let assigneeUserId: String?
    let participantUserIds: [String]
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
    let completedAt: String?
    let details: String?
    let assigneeUserId: String?
    let participantUserIds: [String]
    let location: String?
    let targetWorkspaceId: String?
    let targetProjectId: String?

    private enum CodingKeys: String, CodingKey {
        case version
        case title
        case body
        case color
        case status
        case priority
        case startAt
        case endAt
        case completedAt
        case details
        case assigneeUserId
        case participantUserIds
        case location
        case targetWorkspaceId
        case targetProjectId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(title, forKey: .title)
        try container.encodeIfPresent(body, forKey: .body)
        try container.encode(color, forKey: .color)
        try container.encode(status, forKey: .status)
        try container.encode(priority, forKey: .priority)
        try container.encodeIfPresent(startAt, forKey: .startAt)
        try container.encodeIfPresent(endAt, forKey: .endAt)
        if let completedAt {
            try container.encode(completedAt, forKey: .completedAt)
        } else {
            try container.encodeNil(forKey: .completedAt)
        }
        try container.encodeIfPresent(details, forKey: .details)
        if let assigneeUserId {
            try container.encode(assigneeUserId, forKey: .assigneeUserId)
        } else {
            try container.encodeNil(forKey: .assigneeUserId)
        }
        try container.encode(participantUserIds, forKey: .participantUserIds)
        try container.encodeIfPresent(location, forKey: .location)
        try container.encodeIfPresent(targetWorkspaceId, forKey: .targetWorkspaceId)
        try container.encodeIfPresent(targetProjectId, forKey: .targetProjectId)
    }
}

struct TodoTaskStatusUpdatePayload: Encodable, Sendable {
    let version: Int
    let status: String
    let completedAt: String?

    private enum CodingKeys: String, CodingKey {
        case version
        case status
        case completedAt
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(status, forKey: .status)
        if let completedAt {
            try container.encode(completedAt, forKey: .completedAt)
        } else {
            try container.encodeNil(forKey: .completedAt)
        }
    }
}

struct TodoTaskPriorityUpdatePayload: Encodable, Sendable {
    let version: Int
    let priority: String
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
    let completedAt: String?
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
    let completedAt: String?
    let details: String?
    let version: Int
    let createdBy: UserBrief?
    let assignee: UserBrief?
    let participants: [UserBrief]?
    let location: String?
    let comments: [TaskComment]?
}

struct TaskDrawerContext: Decodable, Sendable {
    let workspaceId: String
    let workspaceName: String
    let projectId: String
    let projectName: String
    let currentUserId: String
    let currentUserDisplayName: String
    let memberOptions: [AssignableUser]
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

// ---------------------------------------------------------------------------
// Sticky notes
// ---------------------------------------------------------------------------

struct StickyNoteLocation: Codable, Hashable, Sendable {
    var lat: Double
    var lng: Double
    var accuracyM: Double?
    var name: String?
    var source: String?
}

struct StickyNoteAttachment: Codable, Identifiable, Hashable, Sendable {
    let id: String
    var attachmentType: String
    var storageUrl: String
    var filename: String
    var mimeType: String
    var byteSize: Int
    var durationMs: Int?
    var widthPx: Int?
    var heightPx: Int?
    var transcript: String?
    var ocrText: String?
    var createdAt: String
}

enum StickyNoteParseStatus: String, Codable, Equatable, Sendable {
    case pending
    case success
    case failed
    case skipped
}

struct StickyNoteAIParse: Codable, Identifiable, Hashable, Equatable, Sendable {
    let id: String
    let stickyNoteId: String
    var parseStatus: StickyNoteParseStatus
    var parseProvider: String?
    var parseLatencyMs: Int?
    var draft: NaturalLanguageTaskDraft?
    var confidence: Double?
    var assumptions: [String]
    var missingFields: [String]
    var ambiguities: [String]
    var convertedItemId: String?
    var convertedAt: String?
    var errorCode: String?
    var errorMessage: String?
    var createdAt: String
}

struct StickyNote: Codable, Identifiable, Hashable, Sendable {
    let id: String
    let ownerUserId: String
    var title: String?
    var content: String
    var recordedAt: String
    var createdAt: String
    var timezone: String
    var location: StickyNoteLocation?
    var deviceKind: String?
    var archivedAt: String?
    var convertedCount: Int
    var attachments: [StickyNoteAttachment]
    var latestParse: StickyNoteAIParse?
}

struct StickyNoteListResponse: Decodable, Sendable {
    let items: [StickyNote]
    let nextCursor: String?
}

struct StickyNoteAttachmentInput: Encodable, Sendable {
    let attachmentType: String
    let filename: String
    let mimeType: String
    let byteSize: Int
    let widthPx: Int?
    let heightPx: Int?
    let durationMs: Int?
}

struct StickyNoteLocationInput: Encodable, Sendable {
    let lat: Double
    let lng: Double
    let accuracyM: Double?
    let name: String?
    let source: String
}

struct StickyNoteCreatePayload: Encodable, Sendable {
    var title: String?
    var content: String
    var recordedAt: String?
    var timezone: String
    var location: StickyNoteLocationInput?
    var attachments: [StickyNoteAttachmentInput]
    var autoParse: Bool
}

struct StickyNoteUpdatePayload: Encodable, Sendable {
    var title: String?
    var content: String?
    var locationName: String?
}

struct StickyNoteConvertPayload: Encodable, Sendable {
    let parseId: String
    let workspaceId: String
    let projectId: String
    let fieldOverrides: [String: AnyEncodableJSON]
}

/// Loose-JSON wrapper so the convert endpoint's ``field_overrides`` dict
/// can carry anything that ``ItemPayload`` accepts.
enum AnyEncodableJSON: Encodable, Hashable, Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)
    case null
    case array([AnyEncodableJSON])
    case object([String: AnyEncodableJSON])

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .int(let v): try c.encode(v)
        case .double(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }

    /// Build from any ``Encodable`` value by round-tripping through JSON.
    static func from(_ value: Any) -> AnyEncodableJSON? {
        if value is NSNull { return .null }
        if let v = value as? String { return .string(v) }
        if let v = value as? Bool { return .bool(v) }
        if let v = value as? Int { return .int(v) }
        if let v = value as? Double { return .double(v) }
        if let v = value as? [Any] { return .array(v.compactMap(from)) }
        if let v = value as? [String: Any] {
            var obj: [String: AnyEncodableJSON] = [:]
            for (k, val) in v { if let x = from(val) { obj[k] = x } }
            return .object(obj)
        }
        return nil
    }
}

struct StickyNoteConvertResponse: Decodable, Sendable {
    let item: ItemResponse
    let stickyNote: StickyNote
    let parse: StickyNoteAIParse
}
