import SwiftUI

private enum ScheduleStyle {
    static let accent = TimiaTheme.primary
    static let accentDark = TimiaTheme.primary
    static let canvas = Color(red: 246 / 255, green: 246 / 255, blue: 242 / 255)
    static let card = Color(red: 253 / 255, green: 253 / 255, blue: 250 / 255)
    static let ink = Color(red: 42 / 255, green: 53 / 255, blue: 49 / 255)
    static let mutedInk = Color(red: 111 / 255, green: 124 / 255, blue: 119 / 255)
    static let grid = Color(red: 198 / 255, green: 207 / 255, blue: 202 / 255)
    static let shadow = Color(red: 58 / 255, green: 72 / 255, blue: 67 / 255).opacity(0.08)
}

private struct ScheduleTaskAppearance {
    let background: Color
    let foreground: Color
    let header: Color

    init(task: ScheduleTask) {
        let palette = Self.priorityPalette(task.priority)
        background = palette.background
        foreground = palette.foreground
        header = Self.customColor(task.color) ?? palette.header
    }

    private static func priorityPalette(_ priority: String?) -> (background: Color, foreground: Color, header: Color) {
        switch priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "2", "medium":
            return (Color(hex: "#DCFCE7"), Color(hex: "#166534"), Color(hex: "#22C55E"))
        case "3", "high":
            return (Color(hex: "#FFEDD5"), Color(hex: "#9A3412"), Color(hex: "#F97316"))
        case "4", "urgent":
            return (Color(hex: "#FEE2E2"), Color(hex: "#991B1B"), Color(hex: "#EF4444"))
        default:
            return (Color(hex: "#DBEAFE"), Color(hex: "#1E40AF"), Color(hex: "#3B82F6"))
        }
    }

    private static func customColor(_ value: String) -> Color? {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard normalized != "#FFFFFF",
              normalized.range(of: #"^#[0-9A-F]{6}$"#, options: .regularExpression) != nil else {
            return nil
        }
        return Color(hex: normalized)
    }
}

private struct ScheduleTaskCard: View {
    let task: ScheduleTask
    var fontSize: CGFloat
    var lineLimit: Int
    var fillsHeight = false
    var isMuted = false

    var body: some View {
        let appearance = ScheduleTaskAppearance(task: task)

        VStack(alignment: .leading, spacing: 0) {
            Rectangle()
                .fill(appearance.header.opacity(isMuted ? 0.4 : 1))
                .frame(height: 3)

            Text(task.title)
                .font(.system(size: fontSize, weight: .semibold, design: .rounded))
                .foregroundStyle(appearance.foreground.opacity(isMuted ? 0.55 : 1))
                .lineLimit(lineLimit)
                .frame(
                    maxWidth: .infinity,
                    maxHeight: fillsHeight ? .infinity : nil,
                    alignment: .topLeading
                )
                .padding(.horizontal, 3)
                .padding(.vertical, 2)
        }
        .background(appearance.background.opacity(isMuted ? 0.38 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 4))
    }
}

private enum ScheduleTaskTiming {
    static func isAllDayOrMultiDay(_ task: ScheduleTask, on date: Date) -> Bool {
        guard let start = ScheduleDate.parseISO(task.startAt),
              let end = ScheduleDate.parseISO(task.endAt),
              end > start else {
            return false
        }

        let calendar = Calendar.current
        let dayStart = calendar.startOfDay(for: date)
        let nextDay = calendar.date(byAdding: .day, value: 1, to: dayStart)
            ?? dayStart.addingTimeInterval(86_400)
        guard start < nextDay, end > dayStart else { return false }

        let endInsideRange = end.addingTimeInterval(-1)
        let crossesDates = !calendar.isDate(start, inSameDayAs: endInsideRange)
        let coversWholeDay = start <= dayStart && end >= nextDay.addingTimeInterval(-60)
        return crossesDates || coversWholeDay
    }
}

struct ScheduleView: View {
    private enum CalendarMode {
        case day
        case month
    }

    @EnvironmentObject private var session: AppSession
    @State private var mode: CalendarMode = .day
    @State private var dayBaseDate = Calendar.current.startOfDay(for: Date())
    @State private var dayPage = 0
    @State private var dayTasks: [String: [ScheduleTask]] = [:]
    @State private var loadingDayPages = Set<Int>()
    @State private var monthAnchor = Date()
    @State private var monthCalendar: ScheduleCalendar?
    @State private var isMonthLoading = false
    @State private var errorMessage: String?
    @State private var selectedTask: ScheduleTask?
    @State private var createSelection: CalendarCreateSelection?

    private let dayPageRange = -72...72

    var body: some View {
        VStack(spacing: 0) {
            header
            Rectangle()
                .fill(ScheduleStyle.grid.opacity(0.55))
                .frame(height: 0.5)

            if let errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text(errorMessage).lineLimit(2)
                    Spacer()
                }
                .font(.system(.caption, design: .rounded, weight: .medium))
                .foregroundStyle(.red)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Color.red.opacity(0.055))
            }

            switch mode {
            case .day:
                dayPager
            case .month:
                monthContent
            }
        }
        .background(ScheduleStyle.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .task(id: dayPage) {
            guard mode == .day else { return }
            await loadDayPage(dayPage)
        }
        .sheet(item: $selectedTask) { task in
            NavigationStack {
                TaskEditorView(mode: .edit(task)) {
                    Task { await reloadVisibleCalendar() }
                }
            }
        }
        .sheet(item: $createSelection) { selection in
            NavigationStack {
                TaskEditorView(mode: selection.hasExactTime ? .createAt(selection.date) : .createOn(selection.date)) {
                    Task { await reloadVisibleCalendar() }
                }
            }
        }
    }

    private var header: some View {
        HStack {
            Text(yearMonthLabel)
                .font(.system(.title3, design: .rounded, weight: .semibold))
                .foregroundStyle(ScheduleStyle.ink)
                .monospacedDigit()

            Spacer()

            ZStack(alignment: mode == .day ? .leading : .trailing) {
                Capsule()
                    .fill(ScheduleStyle.accent.opacity(0.14))

                Capsule()
                    .fill(ScheduleStyle.accent.opacity(0.5))
                    .frame(width: 43)
                    .padding(3)
                    .shadow(color: ScheduleStyle.shadow, radius: 6, y: 3)

                HStack(spacing: 0) {
                    Text("日")
                        .foregroundStyle(mode == .day ? ScheduleStyle.ink : ScheduleStyle.mutedInk)
                        .frame(maxWidth: .infinity)
                    Text("月")
                        .foregroundStyle(mode == .month ? ScheduleStyle.ink : ScheduleStyle.mutedInk)
                        .frame(maxWidth: .infinity)
                }
                .font(.system(.subheadline, design: .rounded, weight: .semibold))
            }
            .frame(width: 92, height: 36)
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        setMode(value.location.x < 46 ? .day : .month)
                    }
            )
            .animation(.spring(response: 0.25, dampingFraction: 0.82), value: mode)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("日月模式")
            .accessibilityValue(mode == .day ? "日模式" : "月模式")
            .accessibilityAdjustableAction { direction in
                setMode(direction == .increment ? .month : .day)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 7)
        .background(ScheduleStyle.canvas.opacity(0.98))
    }

    private var dayPager: some View {
        FixedAxisTimelinePager(
            baseDate: dayBaseDate,
            pageRange: dayPageRange,
            selection: $dayPage,
            tasksByDay: dayTasks,
            loadingPages: loadingDayPages,
            onTask: { selectedTask = $0 },
            onCreateTime: {
                createSelection = CalendarCreateSelection(date: $0, hasExactTime: true)
            },
            onRefresh: { await reloadDayPage(dayPage) }
        )
        .onChange(of: dayPage) { _, newPage in
            errorMessage = nil
            Task { await loadDayPage(newPage) }
        }
    }

    @ViewBuilder
    private var monthContent: some View {
        if isMonthLoading && monthCalendar == nil {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let monthCalendar {
            MonthCalendarView(
                calendar: monthCalendar,
                onTask: { selectedTask = $0 },
                onCreateDate: {
                    createSelection = CalendarCreateSelection(date: $0, hasExactTime: false)
                },
                onShiftMonth: shiftMonth
            )
                .opacity(isMonthLoading ? 0.55 : 1)
                .animation(.easeInOut(duration: 0.18), value: isMonthLoading)
                .refreshable { await loadMonth(force: true) }
        } else {
            ContentUnavailableView(
                "暂无日程",
                systemImage: "calendar.badge.checkmark",
                description: Text("下拉可重新加载")
            )
        }
    }

    private var yearMonthLabel: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy年MM月"
        let date = mode == .day ? dayPageStart(dayPage) : monthAnchor
        return formatter.string(from: date)
    }

    private func setMode(_ newMode: CalendarMode) {
        guard mode != newMode else { return }
        errorMessage = nil
        switch newMode {
        case .month:
            monthAnchor = dayPageStart(dayPage)
            mode = .month
            Task { await loadMonth() }
        case .day:
            dayBaseDate = Calendar.current.startOfDay(for: monthAnchor)
            dayPage = 0
            mode = .day
            Task { await loadDayPage(0) }
        }
    }

    private func dayPageStart(_ page: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: page * 5, to: dayBaseDate) ?? dayBaseDate
    }

    private func shiftMonth(_ direction: Int) {
        guard !isMonthLoading else { return }
        monthAnchor = Calendar.current.date(byAdding: .month, value: direction, to: monthAnchor)
            ?? monthAnchor
        errorMessage = nil
        Task { await loadMonth(force: true) }
    }

    private func loadDayPage(_ page: Int, force: Bool = false) async {
        guard !loadingDayPages.contains(page) else { return }
        let dates = (0..<5).compactMap {
            Calendar.current.date(byAdding: .day, value: $0, to: dayPageStart(page))
        }
        let missingDates = force ? dates : dates.filter { dayTasks[ScheduleDate.key($0)] == nil }
        guard !missingDates.isEmpty else { return }

        loadingDayPages.insert(page)
        defer { loadingDayPages.remove(page) }
        let api = session.api

        do {
            let results = try await withThrowingTaskGroup(of: DayLoadResult.self) { group in
                for date in missingDates {
                    group.addTask {
                        let key = ScheduleDate.key(date)
                        let calendar = try await api.request(
                            "/views/schedule/calendar",
                            query: [
                                URLQueryItem(name: "scope", value: "me"),
                                URLQueryItem(name: "view", value: "day"),
                                URLQueryItem(name: "anchor", value: key)
                            ],
                            response: ScheduleCalendar.self
                        )
                        return DayLoadResult(key: key, tasks: calendar.day?.items ?? [])
                    }
                }

                var values: [DayLoadResult] = []
                for try await value in group {
                    values.append(value)
                }
                return values
            }

            for result in results {
                dayTasks[result.key] = result.tasks
            }
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadDayPage(_ page: Int) async {
        await loadDayPage(page, force: true)
    }

    private func loadMonth(force: Bool = false) async {
        if !force,
           let monthCalendar,
           monthCalendar.month == ScheduleDate.monthKey(monthAnchor) {
            return
        }

        isMonthLoading = true
        defer { isMonthLoading = false }
        do {
            monthCalendar = try await session.api.request(
                "/views/schedule/calendar",
                query: [
                    URLQueryItem(name: "scope", value: "me"),
                    URLQueryItem(name: "view", value: "month"),
                    URLQueryItem(name: "anchor", value: ScheduleDate.key(monthAnchor))
                ],
                response: ScheduleCalendar.self
            )
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func reloadVisibleCalendar() async {
        switch mode {
        case .day:
            await reloadDayPage(dayPage)
        case .month:
            await loadMonth(force: true)
        }
    }
}

private struct DayLoadResult: Sendable {
    let key: String
    let tasks: [ScheduleTask]
}

private struct CalendarCreateSelection: Identifiable {
    let date: Date
    let hasExactTime: Bool
    var id: String { "\(date.timeIntervalSinceReferenceDate)-\(hasExactTime)" }
}

private enum TimelineMetrics {
    static let hourHeight: CGFloat = 58
    static let axisWidth: CGFloat = 44
    static let dateHeaderHeight: CGFloat = 30
    static let allDayMinimumHeight: CGFloat = 38
    static let allDayTaskHeight: CGFloat = 26
    static let allDayTaskSpacing: CGFloat = 3
    static let totalHeight: CGFloat = hourHeight * 24
}

private struct FixedAxisTimelinePager: View {
    let baseDate: Date
    let pageRange: ClosedRange<Int>
    @Binding var selection: Int
    let tasksByDay: [String: [ScheduleTask]]
    let loadingPages: Set<Int>
    let onTask: (ScheduleTask) -> Void
    let onCreateTime: (Date) -> Void
    let onRefresh: () async -> Void

    var body: some View {
        ScrollView(.vertical) {
            HStack(alignment: .top, spacing: 0) {
                VStack(spacing: 0) {
                    ScheduleStyle.card
                        .frame(width: TimelineMetrics.axisWidth, height: TimelineMetrics.dateHeaderHeight)
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(ScheduleStyle.grid.opacity(0.55)).frame(height: 0.5)
                        }
                    Text("全天")
                        .font(.system(size: 9, weight: .medium, design: .rounded))
                        .foregroundStyle(ScheduleStyle.mutedInk)
                        .padding(.top, 8)
                        .frame(width: TimelineMetrics.axisWidth, height: allDayHeight, alignment: .topTrailing)
                        .background(ScheduleStyle.canvas)
                        .overlay(alignment: .trailing) {
                            Rectangle().fill(ScheduleStyle.grid.opacity(0.55)).frame(width: 0.5)
                        }
                        .overlay(alignment: .bottom) {
                            Rectangle().fill(ScheduleStyle.grid.opacity(0.55)).frame(height: 0.5)
                        }
                    TimelineHourAxis()
                }

                TabView(selection: $selection) {
                    ForEach(pageRange, id: \.self) { page in
                        FiveDayTimelinePage(
                            startDate: pageStart(page),
                            tasksByDay: tasksByDay,
                            allDayHeight: allDayHeight,
                            onTask: onTask,
                            onCreateTime: onCreateTime
                        )
                        .tag(page)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .frame(height: TimelineMetrics.dateHeaderHeight + allDayHeight + TimelineMetrics.totalHeight)
            }
        }
        .scrollIndicators(.visible)
        .refreshable { await onRefresh() }
        .overlay {
            if loadingPages.contains(selection) {
                ProgressView()
                    .tint(ScheduleStyle.accentDark)
                    .padding(10)
                    .background(.regularMaterial, in: Circle())
                    .shadow(color: ScheduleStyle.shadow, radius: 8, y: 3)
            }
        }
        .background(ScheduleStyle.card)
    }

    private func pageStart(_ page: Int) -> Date {
        Calendar.current.date(byAdding: .day, value: page * 5, to: baseDate) ?? baseDate
    }

    private var allDayHeight: CGFloat {
        let dates = (0..<5).compactMap {
            Calendar.current.date(byAdding: .day, value: $0, to: pageStart(selection))
        }
        let maximumCount = dates.map { date in
            (tasksByDay[ScheduleDate.key(date)] ?? [])
                .filter { ScheduleTaskTiming.isAllDayOrMultiDay($0, on: date) }
                .count
        }
        .max() ?? 0

        guard maximumCount > 0 else { return TimelineMetrics.allDayMinimumHeight }
        return max(
            TimelineMetrics.allDayMinimumHeight,
            CGFloat(maximumCount) * TimelineMetrics.allDayTaskHeight
                + CGFloat(maximumCount - 1) * TimelineMetrics.allDayTaskSpacing
                + 8
        )
    }
}

private struct FiveDayTimelinePage: View {
    let startDate: Date
    let tasksByDay: [String: [ScheduleTask]]
    let allDayHeight: CGFloat
    let onTask: (ScheduleTask) -> Void
    let onCreateTime: (Date) -> Void

    private var dates: [Date] {
        (0..<5).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: startDate) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(dates, id: \.self) { date in
                    Text(ScheduleDate.dayLabel(date))
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(Calendar.current.isDateInToday(date) ? ScheduleStyle.accentDark : ScheduleStyle.ink)
                        .frame(maxWidth: .infinity)
                        .frame(height: TimelineMetrics.dateHeaderHeight)
                        .background(
                            Calendar.current.isDateInToday(date)
                                ? ScheduleStyle.accent.opacity(0.5)
                                : ScheduleStyle.card
                        )
                }
            }
            .overlay(alignment: .bottom) {
                Rectangle().fill(ScheduleStyle.grid.opacity(0.55)).frame(height: 0.5)
            }

            HStack(alignment: .top, spacing: 0) {
                ForEach(dates, id: \.self) { date in
                    AllDayTaskColumn(
                        date: date,
                        tasks: tasksByDay[ScheduleDate.key(date)] ?? [],
                        onTask: onTask
                    )
                }
            }
            .frame(height: allDayHeight, alignment: .top)
            .background(ScheduleStyle.card)
            .overlay(alignment: .bottom) {
                Rectangle().fill(ScheduleStyle.grid.opacity(0.55)).frame(height: 0.5)
            }

            HStack(alignment: .top, spacing: 0) {
                ForEach(dates, id: \.self) { date in
                    DayTimelineColumn(
                        date: date,
                        tasks: tasksByDay[ScheduleDate.key(date)] ?? [],
                        onTask: onTask,
                        onCreateTime: onCreateTime
                    )
                }
            }
        }
    }
}

private struct AllDayTaskColumn: View {
    let date: Date
    let tasks: [ScheduleTask]
    let onTask: (ScheduleTask) -> Void

    private var allDayTasks: [ScheduleTask] {
        tasks
            .filter { ScheduleTaskTiming.isAllDayOrMultiDay($0, on: date) }
            .sorted {
                let left = ScheduleDate.parseISO($0.startAt) ?? .distantPast
                let right = ScheduleDate.parseISO($1.startAt) ?? .distantPast
                return left == right ? $0.id < $1.id : left < right
            }
    }

    var body: some View {
        VStack(spacing: TimelineMetrics.allDayTaskSpacing) {
            ForEach(allDayTasks) { task in
                Button { onTask(task) } label: {
                    ScheduleTaskCard(
                        task: task,
                        fontSize: 8,
                        lineLimit: 1,
                        fillsHeight: true
                    )
                }
                .buttonStyle(.plain)
                .frame(height: TimelineMetrics.allDayTaskHeight)
            }
        }
        .padding(.horizontal, 1.5)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .overlay(alignment: .leading) {
            DashedVerticalDivider()
        }
        .overlay(alignment: .trailing) {
            DashedVerticalDivider()
        }
    }
}

private struct DashedVerticalDivider: View {
    var body: some View {
        Rectangle()
            .stroke(
                ScheduleStyle.grid.opacity(0.72),
                style: StrokeStyle(lineWidth: 0.7, dash: [4, 4])
            )
            .frame(width: 0.7)
            .allowsHitTesting(false)
    }
}

private struct TimelineHourAxis: View {
    var body: some View {
        ZStack(alignment: .topTrailing) {
            ScheduleStyle.canvas
            ForEach(0...24, id: \.self) { hour in
                Text(String(format: "%02d:00", hour))
                    .font(.system(size: 8, weight: .medium, design: .monospaced))
                    .foregroundStyle(ScheduleStyle.mutedInk)
                    .position(
                        x: TimelineMetrics.axisWidth / 2,
                        y: labelY(for: hour)
                    )
            }
        }
        .frame(width: TimelineMetrics.axisWidth, height: TimelineMetrics.totalHeight)
    }

    private func labelY(for hour: Int) -> CGFloat {
        if hour == 0 { return 7 }
        if hour == 24 { return TimelineMetrics.totalHeight - 7 }
        return CGFloat(hour) * TimelineMetrics.hourHeight
    }
}

private struct DayTimelineColumn: View {
    let date: Date
    let tasks: [ScheduleTask]
    let onTask: (ScheduleTask) -> Void
    let onCreateTime: (Date) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            ScheduleStyle.card
                .contentShape(Rectangle())
                .gesture(
                    SpatialTapGesture()
                        .onEnded { value in
                            onCreateTime(date(at: value.location.y))
                        }
                )
            DashedDayGrid()

            ForEach(tasks.filter { !ScheduleTaskTiming.isAllDayOrMultiDay($0, on: date) }) { task in
                let placement = taskPlacement(task)
                Button { onTask(task) } label: {
                    ScheduleTaskCard(
                        task: task,
                        fontSize: 9,
                        lineLimit: 3,
                        fillsHeight: true
                    )
                }
                .buttonStyle(.plain)
                .frame(height: placement.height)
                .offset(y: placement.y)
                .padding(.horizontal, 1.5)
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: TimelineMetrics.totalHeight)
    }

    private func taskPlacement(_ task: ScheduleTask) -> (y: CGFloat, height: CGFloat) {
        let startOfDay = Calendar.current.startOfDay(for: date)
        let endOfDay = Calendar.current.date(byAdding: .day, value: 1, to: startOfDay)
            ?? startOfDay.addingTimeInterval(86_400)
        let rawStart = ScheduleDate.parseISO(task.startAt) ?? startOfDay
        let rawEnd = ScheduleDate.parseISO(task.endAt) ?? rawStart.addingTimeInterval(3_600)
        let start = min(max(rawStart, startOfDay), endOfDay)
        let end = min(max(rawEnd, start.addingTimeInterval(1_800)), endOfDay)
        let y = CGFloat(start.timeIntervalSince(startOfDay) / 3_600) * TimelineMetrics.hourHeight + 1
        let height = max(26, CGFloat(end.timeIntervalSince(start) / 3_600) * TimelineMetrics.hourHeight - 2)
        return (y, height)
    }

    private func date(at y: CGFloat) -> Date {
        let rawMinutes = Int((max(0, y) / TimelineMetrics.hourHeight) * 60)
        let roundedMinutes = min(1_425, max(0, Int((Double(rawMinutes) / 15).rounded()) * 15))
        let startOfDay = Calendar.current.startOfDay(for: date)
        return Calendar.current.date(byAdding: .minute, value: roundedMinutes, to: startOfDay)
            ?? startOfDay
    }
}

private struct DashedDayGrid: View {
    var body: some View {
        GeometryReader { proxy in
            Path { path in
                for hour in 0...24 {
                    let y = CGFloat(hour) * TimelineMetrics.hourHeight
                    path.move(to: CGPoint(x: 0, y: y))
                    path.addLine(to: CGPoint(x: proxy.size.width, y: y))
                }
                path.move(to: CGPoint(x: 0.5, y: 0))
                path.addLine(to: CGPoint(x: 0.5, y: TimelineMetrics.totalHeight))
                path.move(to: CGPoint(x: max(0.5, proxy.size.width - 0.5), y: 0))
                path.addLine(to: CGPoint(x: max(0.5, proxy.size.width - 0.5), y: TimelineMetrics.totalHeight))
            }
            .stroke(
                ScheduleStyle.grid.opacity(0.72),
                style: StrokeStyle(lineWidth: 0.7, dash: [4, 4])
            )
        }
        .allowsHitTesting(false)
    }
}

private struct MonthCalendarView: View {
    let calendar: ScheduleCalendar
    let onTask: (ScheduleTask) -> Void
    let onCreateDate: (Date) -> Void
    let onShiftMonth: (Int) -> Void

    private let bottomSpacing: CGFloat = 14

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: 3, alignment: .top),
        count: 7
    )

    var body: some View {
        GeometryReader { proxy in
            let weeks = calendar.weeks ?? []
            let rowHeight = rowHeight(in: proxy.size.height, weekCount: weeks.count)

            ScrollView(.vertical) {
                VStack(spacing: 3) {
                    LazyVGrid(columns: columns, spacing: 3) {
                        ForEach(["日", "一", "二", "三", "四", "五", "六"], id: \.self) {
                            Text($0)
                                .font(.system(.caption, design: .rounded, weight: .semibold))
                                .foregroundStyle(ScheduleStyle.mutedInk)
                                .frame(maxWidth: .infinity)
                                .frame(height: 30)
                        }
                    }

                    ForEach(Array(weeks.enumerated()), id: \.offset) { _, week in
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 3) {
                            ForEach(Array(week.days.enumerated()), id: \.element.id) { index, day in
                                MonthDayCell(
                                    day: day,
                                    tasks: tasks(in: week, dayIndex: index),
                                    height: rowHeight,
                                    onTask: onTask,
                                    onCreateDate: onCreateDate
                                )
                            }
                        }
                    }
                }
                .padding(.horizontal, 6)
                .padding(.bottom, bottomSpacing)
                .frame(minHeight: proxy.size.height, alignment: .top)
            }
        }
        .background(ScheduleStyle.canvas)
        .simultaneousGesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    guard abs(value.translation.width) > abs(value.translation.height),
                          abs(value.translation.width) > 55 else { return }
                    onShiftMonth(value.translation.width < 0 ? 1 : -1)
                }
        )
    }

    private func rowHeight(in availableHeight: CGFloat, weekCount: Int) -> CGFloat {
        guard weekCount > 0 else { return 82 }
        let weekdayHeader: CGFloat = 30
        let verticalGaps = CGFloat(weekCount) * 3
        return max(
            82,
            (availableHeight - weekdayHeader - verticalGaps - bottomSpacing) / CGFloat(weekCount)
        )
    }

    private func tasks(in week: CalendarWeek, dayIndex: Int) -> [ScheduleTask] {
        var seen = Set<String>()
        return week.segments
            .filter { dayIndex + 1 >= $0.colStart && dayIndex + 1 < $0.colStart + $0.colSpan }
            .sorted { $0.lane < $1.lane }
            .map(\.item)
            .filter { seen.insert($0.id).inserted }
    }
}

private struct MonthDayCell: View {
    let day: CalendarDay
    let tasks: [ScheduleTask]
    let height: CGFloat
    let onTask: (ScheduleTask) -> Void
    let onCreateDate: (Date) -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            Button {
                if let date = ScheduleDate.date(from: day.key) {
                    onCreateDate(date)
                }
            } label: {
                day.inMonth
                    ? ScheduleStyle.card
                    : ScheduleStyle.accent.opacity(0.055)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 3) {
                Text(String(format: "%02d", day.day))
                    .font(.system(.caption2, design: .rounded, weight: .semibold))
                    .foregroundStyle(isToday ? ScheduleStyle.ink : (day.inMonth ? ScheduleStyle.ink : ScheduleStyle.mutedInk))
                    .frame(width: 20, height: 20)
                    .background(isToday ? ScheduleStyle.accent.opacity(0.5) : .clear, in: Circle())
                    .allowsHitTesting(false)

                ForEach(tasks.prefix(3)) { task in
                    Button { onTask(task) } label: {
                        ScheduleTaskCard(
                            task: task,
                            fontSize: 8,
                            lineLimit: 1,
                            isMuted: !day.inMonth
                        )
                    }
                    .buttonStyle(.plain)
                }

                Spacer(minLength: 0)
            }
            .padding(4)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height, alignment: .topLeading)
        .overlay {
            RoundedRectangle(cornerRadius: 9)
                .stroke(ScheduleStyle.grid.opacity(0.42), lineWidth: 0.5)
        }
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .shadow(color: day.inMonth ? ScheduleStyle.shadow : .clear, radius: 3, y: 1)
    }

    private var isToday: Bool {
        ScheduleDate.date(from: day.key).map(Calendar.current.isDateInToday) ?? false
    }
}

private enum ScheduleDate {
    static func key(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    static func monthKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM"
        return formatter.string(from: date)
    }

    static func dayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "dd日"
        return formatter.string(from: date)
    }

    static func date(from key: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: key)
    }

    static func parseISO(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}
