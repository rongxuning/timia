import SwiftUI

private struct SchedulePriorityStyle {
    let background: Color
    let foreground: Color
    let accent: Color

    init(priority: String?, colorScheme: ColorScheme) {
        let isDark = colorScheme == .dark
        switch priority?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "2", "low":
            background = Color(hex: isDark ? "#123D26" : "#DCFCE7")
            foreground = Color(hex: isDark ? "#86EFAC" : "#15803D")
            accent = Color(hex: "#22C55E")
        case "3", "medium":
            background = Color(hex: isDark ? "#422F08" : "#FEF9C3")
            foreground = Color(hex: isDark ? "#FDE68A" : "#854D0E")
            accent = Color(hex: "#EAB308")
        case "4", "high", "urgent":
            background = Color(hex: isDark ? "#4A1618" : "#FEE2E2")
            foreground = Color(hex: isDark ? "#FCA5A5" : "#B91C1C")
            accent = Color(hex: "#EF4444")
        default:
            background = Color(hex: isDark ? "#172554" : "#DBEAFE")
            foreground = Color(hex: isDark ? "#93C5FD" : "#1D4ED8")
            accent = Color(hex: "#3B82F6")
        }
    }
}

struct ScheduleHomeView: View {
    private enum ContentMode: String, CaseIterable {
        case todo
        case calendar
    }

    private enum CalendarRange: String, CaseIterable {
        case day = "D"
        case week = "W"
        case month = "M"
        case year = "Y"

        var apiValue: String {
            switch self {
            case .day: "day"
            case .week: "week"
            case .month: "month"
            case .year: "year"
            }
        }
    }

    let user: CurrentUser
    let onOpenWorkspaces: () -> Void
    let onOpenAccount: () -> Void

    @EnvironmentObject private var session: AppSession
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var contentMode: ContentMode = .calendar
    @State private var range: CalendarRange = .day
    @State private var selectedDate = Date()
    @State private var calendarData: ScheduleCalendar?
    @State private var calendarCache: [String: ScheduleCalendar] = [:]
    @State private var loadingCalendarKeys: Set<String> = []
    @State private var todoColumns: [String: [ScheduleTask]] = [:]
    @State private var todoTotals: [String: Int] = [:]
    @State private var todoHasMore: [String: Bool] = [:]
    @State private var loadingTodoStatuses: Set<String> = []
    @State private var isLoading = false
    @State private var errorTip: String?
    @State private var selectedTask: ScheduleTask?
    @State private var createSelection: ScheduleCreateSelection?
    @State private var naturalLanguageText = ""
    @State private var isParsing = false
    @State private var parseResponse: NaturalLanguageParseResponse?

    var body: some View {
        ZStack {
            TimiaTheme.surface.ignoresSafeArea()

            VStack(spacing: 0) {
                header

                Group {
                    if contentMode == .todo {
                        TodoScheduleView(
                            columns: todoColumns,
                            totals: todoTotals,
                            hasMore: todoHasMore,
                            loadingStatuses: loadingTodoStatuses,
                            onLoadMore: { status in
                                Task { await loadMoreTodo(status) }
                            },
                            onTaskTap: { selectedTask = $0 }
                        )
                    } else {
                        calendarContent
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            if let errorTip {
                Text(errorTip)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(.black.opacity(0.78), in: Capsule())
                    .padding(.horizontal, 28)
                    .transition(.opacity.combined(with: .scale(scale: 0.96)))
                    .zIndex(10)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomControls
        }
        .task { await loadVisibleContent() }
        .onChange(of: range) { _, _ in
            calendarData = cachedCalendar(for: selectedDate, range: range)
            Task { await loadCalendar() }
        }
        .onChange(of: contentMode) { _, newValue in
            Task {
                if newValue == .todo {
                    await loadTodo()
                } else {
                    await loadCalendar()
                }
            }
        }
        .sheet(item: $selectedTask) { task in
            NavigationStack {
                TaskEditorView(mode: .edit(task)) {
                    Task { await loadVisibleContent(force: true) }
                }
            }
        }
        .sheet(item: $createSelection) { selection in
            NavigationStack {
                TaskEditorView(mode: selection.hasExactTime ? .createAt(selection.date) : .createOn(selection.date)) {
                    Task { await loadVisibleContent(force: true) }
                }
            }
        }
        .sheet(item: $parseResponse) { response in
            NaturalLanguageConfirmationView(response: response) {
                parseResponse = nil
                naturalLanguageText = ""
                Task { await loadVisibleContent(force: true) }
            }
            .environmentObject(session)
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            Group {
            if contentMode == .calendar, range == .month || range == .year {
                    ZStack(alignment: .leading) {
                        Text(headerTitle)
                            .id(headerTitle)
                            .transition(periodHeaderTransition)
                    }
                    .animation(.easeInOut(duration: reduceMotion ? 0.18 : 0.3), value: headerTitle)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("calendar-header-title")
                    .accessibilityValue(headerTitle)
                } else {
                    Text(headerTitle)
                        .contentTransition(.numericText())
                        .accessibilityIdentifier("calendar-header-title")
                        .accessibilityValue(headerTitle)
                }
            }
            .font(.system(size: 29, weight: .bold, design: .rounded))

            Spacer()

            Button(action: onOpenWorkspaces) {
                Image(systemName: "square.grid.2x2")
                    .font(.body.weight(.semibold))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.circle)
            .controlSize(.large)
            .accessibilityLabel("打开空间页面")

            Button(action: onOpenAccount) {
                Text(user.initials)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .frame(width: 40, height: 40)
                    .background(TimiaTheme.primary.gradient, in: Circle())
                    .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
                    .shadow(color: TimiaTheme.shadow, radius: 8, y: 3)
            }
            .accessibilityLabel("打开我的页面")
        }
        .padding(.horizontal, 20)
        .padding(.top, 6)
        .padding(.bottom, 6)
        .background(TimiaTheme.surface)
    }

    private var periodHeaderTransition: AnyTransition {
        if reduceMotion {
            return .opacity
        }
        return .asymmetric(
            insertion: .move(edge: .bottom).combined(with: .opacity),
            removal: .opacity
        )
    }

    @ViewBuilder
    private var calendarContent: some View {
        if isLoading, calendarData == nil {
            ProgressView("正在加载日程…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            switch range {
            case .day:
                DayScheduleView(
                    selectedDate: selectedDate,
                    daysByAnchor: cachedDaysByAnchor,
                    onSelectDate: selectDate,
                    onVisibleDate: selectVisibleDay,
                    onCreateTime: { createSelection = ScheduleCreateSelection(date: $0, hasExactTime: true) },
                    onTaskTap: { selectedTask = $0 }
                )
            case .week:
                WeekScheduleView(
                    selectedDate: selectedDate,
                    weeksByAnchor: cachedWeeksByAnchor,
                    onVisibleWeek: selectVisibleWeek,
                    onCreateTime: { createSelection = ScheduleCreateSelection(date: $0, hasExactTime: true) },
                    onTaskTap: { selectedTask = $0 }
                )
            case .month:
                MonthScheduleView(
                    selectedDate: selectedDate,
                    weeksByMonth: cachedMonthWeeks,
                    onSelectDate: { date in
                        selectedDate = date
                        range = .day
                    },
                    onVisibleMonth: selectVisibleMonth,
                    onCreateDate: { createSelection = ScheduleCreateSelection(date: $0, hasExactTime: false) },
                    onTaskTap: { selectedTask = $0 }
                )
            case .year:
                YearScheduleView(
                    year: Calendar.current.component(.year, from: selectedDate),
                    monthsByYear: cachedYearMonths,
                    onSelectMonth: { year, month in
                        var values = DateComponents()
                        values.year = year
                        values.month = month
                        values.day = 1
                        selectedDate = Calendar.current.date(from: values) ?? selectedDate
                        range = .month
                    },
                    onVisibleYear: selectVisibleYear
                )
            }
        }
    }

    private var cachedYearMonths: [Int: [CalendarMonthSummary]] {
        var result: [Int: [CalendarMonthSummary]] = [:]
        for (key, value) in calendarCache where key.hasPrefix("\(CalendarRange.year.apiValue):") {
            guard let year = value.year, let months = value.months else { continue }
            result[year] = months
        }
        if let year = calendarData?.year, let months = calendarData?.months {
            result[year] = months
        }
        return result
    }

    private var cachedMonthWeeks: [String: [CalendarWeek]] {
        var result: [String: [CalendarWeek]] = [:]
        for (key, value) in calendarCache where key.hasPrefix("\(CalendarRange.month.apiValue):") {
            let anchorKey = String(key.dropFirst("\(CalendarRange.month.apiValue):".count))
            guard let anchor = ScheduleFormat.date(anchorKey), let weeks = value.weeks else { continue }
            result[ScheduleFormat.monthKey(anchor)] = weeks
        }
        if let weeks = calendarData?.weeks {
            result[ScheduleFormat.monthKey(selectedDate)] = weeks
        }
        return result
    }

    private var cachedWeeksByAnchor: [String: CalendarWeek] {
        var result: [String: CalendarWeek] = [:]
        for (key, value) in calendarCache where key.hasPrefix("\(CalendarRange.week.apiValue):") {
            guard let week = value.weeks?.first,
                  let firstDayKey = week.days.first?.key,
                  let firstDay = ScheduleFormat.date(firstDayKey) else {
                continue
            }
            result[ScheduleFormat.weekKey(firstDay)] = week
        }
        if let week = calendarData?.weeks?.first,
           let firstDayKey = week.days.first?.key,
           let firstDay = ScheduleFormat.date(firstDayKey) {
            result[ScheduleFormat.weekKey(firstDay)] = week
        }
        return result
    }

    private var cachedDaysByAnchor: [String: CalendarDayDetail] {
        var result: [String: CalendarDayDetail] = [:]
        for (key, value) in calendarCache where key.hasPrefix("\(CalendarRange.day.apiValue):") {
            guard let day = value.day else { continue }
            result[day.key] = day
        }
        if let day = calendarData?.day {
            result[day.key] = day
        }
        return result
    }

    private var bottomControls: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    modeButton(.todo, symbol: "checklist")
                    modeButton(.calendar, symbol: "calendar")
                }
                .padding(4)
                .background(TimiaTheme.field, in: Capsule())

                if contentMode == .calendar {
                    HStack(spacing: 2) {
                        ForEach(CalendarRange.allCases, id: \.self) { value in
                            Button {
                                selectRange(value)
                            } label: {
                                Text(value.rawValue)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(range == value ? .white : .secondary)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 38)
                                    .background(range == value ? Color.primary.opacity(0.78) : .clear, in: Capsule())
                            }
                        }
                    }
                    .padding(4)
                    .frame(maxWidth: .infinity)
                    .background(TimiaTheme.field, in: Capsule())
                    .transition(
                        .asymmetric(
                            insertion: .move(edge: .leading).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)
                        )
                    )
                } else {
                    Spacer(minLength: 0)
                }
            }
            .animation(.snappy(duration: 0.32), value: contentMode)

            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.secondary)

                TextField("用自然语言添加任务…", text: $naturalLanguageText, axis: .vertical)
                    .lineLimit(1...3)
                    .submitLabel(.send)
                    .onSubmit { Task { await parseNaturalLanguage() } }

                Button {
                    Task { await parseNaturalLanguage() }
                } label: {
                    Group {
                        if isParsing {
                            ProgressView().tint(.white)
                        } else {
                            Image(systemName: "arrow.up")
                                .font(.body.bold())
                        }
                    }
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(canParse ? TimiaTheme.primary : Color.secondary.opacity(0.35), in: Circle())
                }
                .disabled(!canParse)
                .accessibilityLabel("解析任务")
            }
            .padding(.leading, 16)
            .padding(.trailing, 7)
            .padding(.vertical, 7)
            .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(TimiaTheme.border.opacity(0.6)))
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial)
    }

    private var canParse: Bool {
        !naturalLanguageText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isParsing
    }

    private func modeButton(_ value: ContentMode, symbol: String) -> some View {
        Button {
            withAnimation(.snappy(duration: 0.25)) { contentMode = value }
        } label: {
            Image(systemName: symbol)
                .font(.body.weight(.semibold))
                .foregroundStyle(contentMode == value ? .white : .secondary)
                .frame(width: 42, height: 38)
                .background(contentMode == value ? Color.primary.opacity(0.78) : .clear, in: Capsule())
        }
        .accessibilityLabel(value == .todo ? "Todo 模式" : "日历模式")
    }

    private var headerTitle: String {
        if contentMode == .calendar, range == .year {
            return "\(Calendar.current.component(.year, from: selectedDate))年"
        }
        return ScheduleFormat.monthTitle(selectedDate)
    }

    private func selectRange(_ newRange: CalendarRange) {
        guard newRange != range else { return }
        let targetDate = newRange == .month || newRange == .year ? Date() : selectedDate
        withAnimation(.snappy(duration: 0.25)) {
            selectedDate = targetDate
            calendarData = cachedCalendar(for: targetDate, range: newRange)
            range = newRange
        }
    }

    private func selectDate(_ date: Date) {
        guard !Calendar.current.isDate(date, inSameDayAs: selectedDate) else { return }
        withAnimation(.snappy(duration: 0.28)) {
            selectedDate = date
            if let cached = cachedCalendar(for: date, range: range) {
                calendarData = cached
            }
        }
        Task { await loadCalendar() }
    }

    private func shiftRange(_ direction: Int) {
        let nextDate = adjacentDate(from: selectedDate, direction: direction, range: range)
        withAnimation(.snappy(duration: 0.32)) {
            selectedDate = nextDate
            if let cached = cachedCalendar(for: nextDate, range: range) {
                calendarData = cached
            }
        }
        Task { await loadCalendar() }
    }

    private func selectVisibleYear(_ year: Int) {
        guard range == .year,
              Calendar.current.component(.year, from: selectedDate) != year,
              let nextDate = Calendar.current.date(from: DateComponents(year: year, month: 1, day: 1)) else {
            return
        }

        selectedDate = nextDate
        if let cached = cachedCalendar(for: nextDate, range: .year) {
            calendarData = cached
        }
        Task { await loadCalendar() }
    }

    private func selectVisibleMonth(_ date: Date) {
        guard range == .month,
              ScheduleFormat.monthKey(selectedDate) != ScheduleFormat.monthKey(date) else {
            return
        }

        selectedDate = date
        if let cached = cachedCalendar(for: date, range: .month) {
            calendarData = cached
        }
        Task { await loadCalendar() }
    }

    private func selectVisibleWeek(_ date: Date) {
        guard range == .week,
              ScheduleFormat.weekKey(selectedDate) != ScheduleFormat.weekKey(date) else {
            return
        }

        selectedDate = date
        if let cached = cachedCalendar(for: date, range: .week) {
            calendarData = cached
        }
        Task { await loadCalendar() }
    }

    private func selectVisibleDay(_ date: Date) {
        guard range == .day,
              ScheduleFormat.dayKey(selectedDate) != ScheduleFormat.dayKey(date) else {
            return
        }

        selectedDate = date
        if let cached = cachedCalendar(for: date, range: .day) {
            calendarData = cached
        }
        Task { await loadCalendar() }
    }

    private func loadVisibleContent(force: Bool = false) async {
        if contentMode == .todo {
            await loadTodo(force: force)
        } else {
            await loadCalendar(force: force)
        }
    }

    private func loadCalendar(force: Bool = false) async {
        let requestedDate = selectedDate
        let requestedRange = range
        let key = calendarCacheKey(for: requestedDate, range: requestedRange)

        if !force, let cached = calendarCache[key] {
            calendarData = cached
        }
        guard force || !loadingCalendarKeys.contains(key) else { return }

        loadingCalendarKeys.insert(key)
        if calendarData == nil { isLoading = true }
        defer {
            loadingCalendarKeys.remove(key)
            if calendarCacheKey(for: selectedDate, range: range) == key {
                isLoading = false
            }
        }

        do {
            let response = try await requestCalendar(for: requestedDate, range: requestedRange)
            calendarCache[key] = response
            if calendarCacheKey(for: selectedDate, range: range) == key {
                calendarData = response
            }
            await prefetchAdjacentCalendars(around: requestedDate, range: requestedRange)
        } catch {
            showTip(error.localizedDescription)
        }
    }

    private func requestCalendar(for date: Date, range: CalendarRange) async throws -> ScheduleCalendar {
        try await session.api.request(
            "/views/schedule/calendar",
            query: [
                URLQueryItem(name: "scope", value: "me"),
                URLQueryItem(name: "view", value: range.apiValue),
                URLQueryItem(name: "anchor", value: ScheduleFormat.dayKey(date))
            ],
            response: ScheduleCalendar.self
        )
    }

    private func prefetchAdjacentCalendars(around date: Date, range: CalendarRange) async {
        let adjacentDates = (-3...3)
            .filter { $0 != 0 }
            .map { adjacentDate(from: date, direction: $0, range: range) }

        await withTaskGroup(of: (String, ScheduleCalendar?).self) { group in
            for candidate in adjacentDates {
                let key = calendarCacheKey(for: candidate, range: range)
                guard calendarCache[key] == nil, !loadingCalendarKeys.contains(key) else { continue }
                loadingCalendarKeys.insert(key)
                group.addTask {
                    let response = try? await requestCalendar(for: candidate, range: range)
                    return (key, response)
                }
            }

            for await (key, response) in group {
                loadingCalendarKeys.remove(key)
                if let response {
                    calendarCache[key] = response
                }
            }
        }
        trimCalendarCache(keeping: date, range: range)
    }

    private func cachedCalendar(for date: Date, range: CalendarRange) -> ScheduleCalendar? {
        calendarCache[calendarCacheKey(for: date, range: range)]
    }

    private func calendarCacheKey(for date: Date, range: CalendarRange) -> String {
        let anchor: Date
        switch range {
        case .day:
            anchor = Calendar.current.startOfDay(for: date)
        case .week:
            anchor = ScheduleFormat.week(containing: date).first ?? date
        case .month:
            anchor = Calendar.current.date(
                from: Calendar.current.dateComponents([.year, .month], from: date)
            ) ?? date
        case .year:
            anchor = Calendar.current.date(
                from: Calendar.current.dateComponents([.year], from: date)
            ) ?? date
        }
        return "\(range.apiValue):\(ScheduleFormat.dayKey(anchor))"
    }

    private func adjacentDate(from date: Date, direction: Int, range: CalendarRange) -> Date {
        let component: Calendar.Component
        switch range {
        case .day: component = .day
        case .week: component = .weekOfYear
        case .month: component = .month
        case .year: component = .year
        }
        return Calendar.current.date(byAdding: component, value: direction, to: date) ?? date
    }

    private func trimCalendarCache(keeping date: Date, range: CalendarRange) {
        let keepKeys = Set((-3...3).map {
            calendarCacheKey(for: adjacentDate(from: date, direction: $0, range: range), range: range)
        })
        calendarCache = calendarCache.filter { key, _ in
            !key.hasPrefix("\(range.apiValue):") || keepKeys.contains(key)
        }
    }

    private func loadTodo(force _: Bool = false) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await session.api.request(
                "/views/schedule/swimlane",
                query: [URLQueryItem(name: "scope", value: "me")],
                response: ScheduleColumns.self
            )
            todoColumns = response.columns
            todoTotals = response.totals
            todoHasMore = response.hasMore
        } catch {
            showTip(error.localizedDescription)
        }
    }

    private func loadMoreTodo(_ status: String) async {
        guard (status == "done" || status == "archived"),
              todoHasMore[status] == true,
              !loadingTodoStatuses.contains(status) else {
            return
        }

        loadingTodoStatuses.insert(status)
        defer { loadingTodoStatuses.remove(status) }
        do {
            let offset = todoColumns[status]?.count ?? 0
            let response = try await session.api.request(
                "/views/schedule/swimlane",
                query: [
                    URLQueryItem(name: "scope", value: "me"),
                    URLQueryItem(name: "status", value: status),
                    URLQueryItem(name: "offset", value: String(offset)),
                    URLQueryItem(name: "limit", value: "10")
                ],
                response: ScheduleColumns.self
            )
            let nextTasks = response.columns[status] ?? []
            var existing = todoColumns[status] ?? []
            let existingIds = Set(existing.map(\.id))
            existing.append(contentsOf: nextTasks.filter { !existingIds.contains($0.id) })
            todoColumns[status] = existing
            todoTotals[status] = response.totals[status]
            todoHasMore[status] = response.hasMore[status]
        } catch {
            showTip(error.localizedDescription)
        }
    }

    private func parseNaturalLanguage() async {
        let value = naturalLanguageText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        isParsing = true
        defer { isParsing = false }
        do {
            parseResponse = try await session.api.request(
                "/views/schedule/natural-language/parse",
                method: "POST",
                body: NaturalLanguageParsePayload(
                    text: value,
                    timezone: TimeZone.current.identifier,
                    referenceTime: ISO8601DateFormatter().string(from: Date()),
                    selectedDate: ScheduleFormat.dayKey(selectedDate)
                ),
                response: NaturalLanguageParseResponse.self
            )
        } catch {
            showTip(error.localizedDescription)
        }
    }

    private func showTip(_ message: String) {
        withAnimation(.easeOut(duration: 0.2)) { errorTip = message }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2.4))
            guard errorTip == message else { return }
            withAnimation(.easeIn(duration: 0.2)) { errorTip = nil }
        }
    }
}

private struct ScheduleCreateSelection: Identifiable {
    let date: Date
    let hasExactTime: Bool
    var id: String { "\(date.timeIntervalSinceReferenceDate)-\(hasExactTime)" }
}

private struct DayScheduleView: View {
    let selectedDate: Date
    let daysByAnchor: [String: CalendarDayDetail]
    let onSelectDate: (Date) -> Void
    let onVisibleDate: (Date) -> Void
    let onCreateTime: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    @State private var anchorDay: Date
    @State private var reportedDayKey: String
    @State private var hasPositionedInitialDay = false
    @State private var isTrackingVisibleDay = false

    init(
        selectedDate: Date,
        daysByAnchor: [String: CalendarDayDetail],
        onSelectDate: @escaping (Date) -> Void,
        onVisibleDate: @escaping (Date) -> Void,
        onCreateTime: @escaping (Date) -> Void,
        onTaskTap: @escaping (ScheduleTask) -> Void
    ) {
        let startOfDay = Calendar.current.startOfDay(for: selectedDate)
        self.selectedDate = selectedDate
        self.daysByAnchor = daysByAnchor
        self.onSelectDate = onSelectDate
        self.onVisibleDate = onVisibleDate
        self.onCreateTime = onCreateTime
        self.onTaskTap = onTaskTap
        _anchorDay = State(initialValue: startOfDay)
        _reportedDayKey = State(initialValue: ScheduleFormat.dayKey(startOfDay))
    }

    var body: some View {
        VStack(spacing: 0) {
            DateStrip(selectedDate: selectedDate, onSelect: onSelectDate)
                .padding(.horizontal, 12)
                .padding(.bottom, 4)

            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    LazyVStack(spacing: 0) {
                        ForEach(-120...120, id: \.self) { offset in
                            let date = Calendar.current.date(
                                byAdding: .day,
                                value: offset,
                                to: anchorDay
                            ) ?? anchorDay
                            let dayKey = ScheduleFormat.dayKey(date)

                            DayTimelineSection(
                                date: date,
                                detail: daysByAnchor[dayKey],
                                onCreateTime: onCreateTime,
                                onTaskTap: onTaskTap
                            )
                            .id(dayKey)
                            .background {
                                GeometryReader { geometry in
                                    Color.clear.preference(
                                        key: DaySectionOffsetPreferenceKey.self,
                                        value: [
                                            dayKey: geometry.frame(in: .named("calendar-day-scroll")).minY
                                        ]
                                    )
                                }
                            }
                        }
                    }
                    .scrollTargetLayout()
                }
                .coordinateSpace(name: "calendar-day-scroll")
                .scrollIndicators(.hidden)
                .task {
                    guard !hasPositionedInitialDay else { return }
                    hasPositionedInitialDay = true
                    await scroll(to: anchorDay, proxy: proxy, animated: false)
                    reportedDayKey = ScheduleFormat.dayKey(anchorDay)
                    isTrackingVisibleDay = true
                }
                .onChange(of: ScheduleFormat.dayKey(selectedDate)) { _, newDayKey in
                    guard newDayKey != reportedDayKey,
                          let date = ScheduleFormat.date(newDayKey) else {
                        return
                    }
                    reportedDayKey = newDayKey
                    Task {
                        await scroll(to: date, proxy: proxy, animated: true)
                    }
                }
                .onPreferenceChange(DaySectionOffsetPreferenceKey.self) { offsets in
                    guard isTrackingVisibleDay,
                          let topDayKey = offsets
                            .filter({ $0.value <= 12 })
                            .max(by: { $0.value < $1.value })?
                            .key,
                          topDayKey != reportedDayKey,
                          let topDay = ScheduleFormat.date(topDayKey) else {
                        return
                    }
                    reportedDayKey = topDayKey
                    onVisibleDate(topDay)
                }
                .accessibilityIdentifier("calendar-day-timeline")
                .accessibilityValue(ScheduleFormat.dayKey(selectedDate))
            }
        }
    }

    private func scroll(to date: Date, proxy: ScrollViewProxy, animated: Bool) async {
        let dayKey = ScheduleFormat.dayKey(date)
        let targetHour = Calendar.current.isDateInToday(date)
            ? max(Calendar.current.component(.hour, from: Date()) - 1, 0)
            : 8
        let position = {
            proxy.scrollTo(dayKey, anchor: .top)
        }
        if animated {
            withAnimation(.snappy(duration: 0.3)) { position() }
        } else {
            position()
        }
        try? await Task.sleep(for: .milliseconds(100))
        if animated {
            withAnimation(.snappy(duration: 0.3)) {
                proxy.scrollTo("\(dayKey)-hour-\(targetHour)", anchor: .top)
            }
        } else {
            proxy.scrollTo("\(dayKey)-hour-\(targetHour)", anchor: .top)
        }
        try? await Task.sleep(for: .milliseconds(180))
    }
}

private struct DayTimelineSection: View {
    let date: Date
    let detail: CalendarDayDetail?
    let onCreateTime: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    private var tasks: [ScheduleTask] { detail?.items ?? [] }

    var body: some View {
        VStack(spacing: 0) {
            Text(ScheduleFormat.fullDateLabel(date))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 8)
                .padding(.top, 8)
                .padding(.bottom, 5)
                .accessibilityIdentifier("calendar-day-label-\(ScheduleFormat.dayKey(date))")

            AllDayRow(
                tasks: tasks.filter(ScheduleFormat.isAllDay),
                dayCount: 1,
                onTaskTap: onTaskTap
            )
            TimelineGrid(
                days: [date],
                tasks: tasks.filter { !ScheduleFormat.isAllDay($0) },
                anchorPrefix: ScheduleFormat.dayKey(date),
                onCreateTime: onCreateTime,
                onTaskTap: onTaskTap
            )
        }
    }
}

private struct DaySectionOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]

    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, newValue in newValue })
    }
}

private struct WeekScheduleView: View {
    let selectedDate: Date
    let weeksByAnchor: [String: CalendarWeek]
    let onVisibleWeek: (Date) -> Void
    let onCreateTime: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    @State private var anchorWeek: Date
    @State private var reportedWeekKey: String
    @State private var hasPositionedInitialWeek = false
    @State private var isTrackingVisibleWeek = false

    init(
        selectedDate: Date,
        weeksByAnchor: [String: CalendarWeek],
        onVisibleWeek: @escaping (Date) -> Void,
        onCreateTime: @escaping (Date) -> Void,
        onTaskTap: @escaping (ScheduleTask) -> Void
    ) {
        let weekStart = ScheduleFormat.week(containing: selectedDate).first ?? selectedDate
        self.selectedDate = selectedDate
        self.weeksByAnchor = weeksByAnchor
        self.onVisibleWeek = onVisibleWeek
        self.onCreateTime = onCreateTime
        self.onTaskTap = onTaskTap
        _anchorWeek = State(initialValue: weekStart)
        _reportedWeekKey = State(initialValue: ScheduleFormat.weekKey(weekStart))
    }

    var body: some View {
        VStack(spacing: 0) {
            WeekHeader(days: ScheduleFormat.week(containing: selectedDate))
            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    LazyVStack(spacing: 0) {
                        ForEach(-104...104, id: \.self) { offset in
                            let weekStart = Calendar.current.date(
                                byAdding: .weekOfYear,
                                value: offset,
                                to: anchorWeek
                            ) ?? anchorWeek
                            let weekKey = ScheduleFormat.weekKey(weekStart)

                            WeekTimelineSection(
                                weekStart: weekStart,
                                week: weeksByAnchor[weekKey],
                                onCreateTime: onCreateTime,
                                onTaskTap: onTaskTap
                            )
                            .id(weekKey)
                            .background {
                                GeometryReader { geometry in
                                    Color.clear.preference(
                                        key: WeekSectionOffsetPreferenceKey.self,
                                        value: [
                                            weekKey: geometry.frame(in: .named("calendar-week-scroll")).minY
                                        ]
                                    )
                                }
                            }
                        }
                    }
                    .scrollTargetLayout()
                }
                .coordinateSpace(name: "calendar-week-scroll")
                .scrollIndicators(.hidden)
                .task {
                    guard !hasPositionedInitialWeek else { return }
                    hasPositionedInitialWeek = true
                    await Task.yield()
                    let weekKey = ScheduleFormat.weekKey(anchorWeek)
                    let includesToday = ScheduleFormat.week(containing: anchorWeek)
                        .contains(where: Calendar.current.isDateInToday)
                    let targetHour = includesToday
                        ? max(Calendar.current.component(.hour, from: Date()) - 1, 0)
                        : 8
                    proxy.scrollTo(weekKey, anchor: .top)
                    try? await Task.sleep(for: .milliseconds(100))
                    proxy.scrollTo("\(weekKey)-hour-\(targetHour)", anchor: .top)
                    try? await Task.sleep(for: .milliseconds(180))
                    reportedWeekKey = weekKey
                    isTrackingVisibleWeek = true
                }
                .onPreferenceChange(WeekSectionOffsetPreferenceKey.self) { offsets in
                    guard isTrackingVisibleWeek,
                          let topWeekKey = offsets
                            .filter({ $0.value <= 12 })
                            .max(by: { $0.value < $1.value })?
                            .key,
                          topWeekKey != reportedWeekKey,
                          let topWeek = ScheduleFormat.date(topWeekKey) else {
                        return
                    }
                    reportedWeekKey = topWeekKey
                    onVisibleWeek(topWeek)
                }
                .accessibilityIdentifier("calendar-week-timeline")
            }
        }
    }
}

private struct WeekTimelineSection: View {
    let weekStart: Date
    let week: CalendarWeek?
    let onCreateTime: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    private var days: [Date] {
        if let values = week?.days.compactMap({ ScheduleFormat.date($0.key) }), values.count == 7 {
            return values
        }
        return ScheduleFormat.week(containing: weekStart)
    }

    private var tasks: [ScheduleTask] {
        var seen = Set<String>()
        return (week?.segments ?? []).compactMap { segment in
            seen.insert(segment.item.id).inserted ? segment.item : nil
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Text(ScheduleFormat.weekLabel(weekStart))
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.leading, 8)
                .padding(.top, 8)
                .padding(.bottom, 5)
                .accessibilityIdentifier("calendar-week-label-\(ScheduleFormat.weekKey(weekStart))")

            AllDayRow(
                tasks: tasks.filter(ScheduleFormat.isAllDay),
                dayCount: 7,
                onTaskTap: onTaskTap
            )
            TimelineGrid(
                days: days,
                tasks: tasks.filter { !ScheduleFormat.isAllDay($0) },
                anchorPrefix: ScheduleFormat.weekKey(weekStart),
                onCreateTime: onCreateTime,
                onTaskTap: onTaskTap
            )
        }
    }
}

private struct WeekSectionOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]

    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, newValue in newValue })
    }
}

private struct DateStrip: View {
    let selectedDate: Date
    let onSelect: (Date) -> Void

    private var days: [Date] { ScheduleFormat.week(containing: selectedDate) }

    var body: some View {
        HStack(spacing: 7) {
            ForEach(days, id: \.self) { date in
                let selected = Calendar.current.isDate(date, inSameDayAs: selectedDate)
                Button { onSelect(date) } label: {
                    VStack(spacing: 5) {
                        Text(ScheduleFormat.weekdayLetter(date))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(selected ? .white.opacity(0.8) : .secondary)
                        Text(date, format: .dateTime.day())
                            .font(.headline.weight(.semibold))
                            .foregroundStyle(selected ? .white : .primary)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(selected ? Color.primary.opacity(0.78) : TimiaTheme.field, in: RoundedRectangle(cornerRadius: 14))
                }
                .accessibilityIdentifier(
                    selected ? "calendar-selected-date" : "calendar-date-\(ScheduleFormat.dayKey(date))"
                )
                .accessibilityValue(ScheduleFormat.dayKey(date))
            }
        }
    }
}

private struct WeekHeader: View {
    let days: [Date]

    var body: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: 48, height: 42)
            ForEach(days, id: \.self) { date in
                let isToday = Calendar.current.isDateInToday(date)
                VStack(spacing: 3) {
                    Text(ScheduleFormat.weekdayLetter(date)).font(.caption2)
                    Text(date, format: .dateTime.day()).font(.subheadline.bold())
                }
                .foregroundStyle(isToday ? .white : .primary)
                .frame(maxWidth: .infinity)
                .frame(height: 42)
                .background(isToday ? Color.primary.opacity(0.76) : .clear, in: RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("calendar-week-date-\(ScheduleFormat.dayKey(date))")
                .accessibilityValue(isToday ? "今天" : ScheduleFormat.dayKey(date))
            }
        }
        .frame(height: 42)
        .padding(.trailing, 6)
        .padding(.bottom, 2)
        .background(TimiaTheme.surface)
    }
}

private struct AllDayRow: View {
    @Environment(\.colorScheme) private var colorScheme

    let tasks: [ScheduleTask]
    let dayCount: Int
    let onTaskTap: (ScheduleTask) -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            Text("全天")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.leading, 8)
                .frame(width: 48, alignment: .leading)
                .padding(.top, 8)

            ScrollView(.horizontal) {
                HStack(spacing: 5) {
                    ForEach(tasks.prefix(5)) { task in
                        let style = SchedulePriorityStyle(priority: task.priority, colorScheme: colorScheme)
                        Button { onTaskTap(task) } label: {
                            Text(task.title)
                                .font(.caption.weight(.semibold))
                                .lineLimit(1)
                                .foregroundStyle(style.foreground)
                                .padding(.horizontal, 9)
                                .frame(height: 30)
                                .background(style.background, in: RoundedRectangle(cornerRadius: 8))
                        }
                    }
                    if tasks.isEmpty {
                        Text("暂无全天任务")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .frame(height: 30)
                    }
                }
                .padding(.horizontal, 4)
            }
            .scrollIndicators(.hidden)
        }
        .frame(minHeight: 46)
        .overlay(alignment: .bottom) {
            DashedDivider().padding(.leading, 48)
        }
    }
}

private struct TimelineGrid: View {
    @Environment(\.colorScheme) private var colorScheme

    let days: [Date]
    let tasks: [ScheduleTask]
    var anchorPrefix: String? = nil
    let onCreateTime: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    private let hourHeight: CGFloat = 74
    private let startHour = 0
    private let endHour = 24

    var body: some View {
        GeometryReader { geometry in
            let labelWidth: CGFloat = 48
            let contentWidth = max(geometry.size.width - labelWidth - 6, 1)
            let dayWidth = contentWidth / CGFloat(max(days.count, 1))

            ZStack(alignment: .topLeading) {
                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        SpatialTapGesture()
                            .onEnded { value in
                                guard value.location.x >= labelWidth else { return }
                                let rawIndex = Int((value.location.x - labelWidth) / dayWidth)
                                let dayIndex = min(max(rawIndex, 0), days.count - 1)
                                let rawMinutes = Int((max(0, value.location.y) / hourHeight) * 60)
                                let roundedMinutes = min(
                                    1_425,
                                    max(0, Int((Double(rawMinutes) / 15).rounded()) * 15)
                                )
                                let startOfDay = Calendar.current.startOfDay(for: days[dayIndex])
                                let date = Calendar.current.date(
                                    byAdding: .minute,
                                    value: roundedMinutes,
                                    to: startOfDay
                                ) ?? startOfDay
                                onCreateTime(date)
                            }
                    )

                VStack(spacing: 0) {
                    ForEach(startHour..<endHour, id: \.self) { hour in
                        Color.clear
                            .frame(height: hourHeight)
                            .id(
                                anchorPrefix.map { "\($0)-hour-\(hour)" }
                                    ?? "timeline-hour-\(hour)"
                            )
                    }
                }

                ForEach(startHour...endHour, id: \.self) { hour in
                    Text(String(format: "%02d:00", hour))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .frame(width: labelWidth - 7, alignment: .trailing)
                        .offset(y: CGFloat(hour - startHour) * hourHeight - 7)

                    DashedDivider()
                        .frame(width: contentWidth)
                        .offset(x: labelWidth, y: CGFloat(hour - startHour) * hourHeight)
                }

                ForEach(1..<days.count, id: \.self) { column in
                    Rectangle()
                        .fill(TimiaTheme.border.opacity(0.3))
                        .frame(width: 0.5, height: CGFloat(endHour - startHour) * hourHeight)
                        .offset(x: labelWidth + CGFloat(column) * dayWidth)
                }

                if days.count == 1, Calendar.current.isDateInToday(days[0]) {
                    CurrentTimeLine(labelWidth: labelWidth, contentWidth: contentWidth, hourHeight: hourHeight)
                }

                ForEach(tasks) { task in
                    if let placement = ScheduleFormat.placement(for: task, days: days) {
                        let style = SchedulePriorityStyle(priority: task.priority, colorScheme: colorScheme)
                        Button { onTaskTap(task) } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(task.title)
                                    .font(days.count == 1 ? .subheadline.weight(.semibold) : .caption2.weight(.semibold))
                                    .lineLimit(days.count == 1 ? 2 : 3)
                                if days.count == 1 {
                                    Text(ScheduleFormat.timeRange(task))
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .foregroundStyle(style.foreground)
                            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                            .padding(days.count == 1 ? 10 : 4)
                            .background(style.background, in: RoundedRectangle(cornerRadius: days.count == 1 ? 16 : 7))
                            .overlay(alignment: .leading) {
                                Capsule().fill(style.accent).frame(width: 3).padding(.vertical, 5)
                            }
                        }
                        .buttonStyle(.plain)
                        .frame(
                            width: max(dayWidth - (days.count == 1 ? 18 : 4), 12),
                            height: max(CGFloat(placement.durationMinutes) / 60 * hourHeight, days.count == 1 ? 48 : 28)
                        )
                        .offset(
                            x: labelWidth + CGFloat(placement.dayIndex) * dayWidth + (days.count == 1 ? 9 : 2),
                            y: CGFloat(placement.startMinutes) / 60 * hourHeight + 4
                        )
                    }
                }
            }
        }
        .frame(height: CGFloat(endHour - startHour) * hourHeight)
        .padding(.top, 7)
        .accessibilityIdentifier("calendar-timeline-grid")
    }
}

private struct CurrentTimeLine: View {
    let labelWidth: CGFloat
    let contentWidth: CGFloat
    let hourHeight: CGFloat

    var body: some View {
        let components = Calendar.current.dateComponents([.hour, .minute], from: Date())
        let minutes = CGFloat((components.hour ?? 0) * 60 + (components.minute ?? 0))
        HStack(spacing: 0) {
            Circle().fill(Color.red).frame(width: 7, height: 7)
            Rectangle().fill(Color.red).frame(height: 1)
        }
        .frame(width: contentWidth + 4)
        .offset(x: labelWidth - 4, y: minutes / 60 * hourHeight)
    }
}

private struct MonthScheduleView: View {
    let selectedDate: Date
    let weeksByMonth: [String: [CalendarWeek]]
    let onSelectDate: (Date) -> Void
    let onVisibleMonth: (Date) -> Void
    let onCreateDate: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)
    @State private var anchorMonth: Date
    @State private var reportedMonthKey: String
    @State private var hasPositionedInitialMonth = false
    @State private var isTrackingVisibleMonth = false

    init(
        selectedDate: Date,
        weeksByMonth: [String: [CalendarWeek]],
        onSelectDate: @escaping (Date) -> Void,
        onVisibleMonth: @escaping (Date) -> Void,
        onCreateDate: @escaping (Date) -> Void,
        onTaskTap: @escaping (ScheduleTask) -> Void
    ) {
        let month = Calendar.current.date(
            from: Calendar.current.dateComponents([.year, .month], from: selectedDate)
        ) ?? selectedDate
        self.selectedDate = selectedDate
        self.weeksByMonth = weeksByMonth
        self.onSelectDate = onSelectDate
        self.onVisibleMonth = onVisibleMonth
        self.onCreateDate = onCreateDate
        self.onTaskTap = onTaskTap
        _anchorMonth = State(initialValue: month)
        _reportedMonthKey = State(initialValue: ScheduleFormat.monthKey(month))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(["日", "一", "二", "三", "四", "五", "六"], id: \.self) {
                    Text($0).font(.caption.weight(.medium)).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 8)
            .padding(.bottom, 8)

            ScrollViewReader { proxy in
                ScrollView(.vertical) {
                    LazyVStack(spacing: 24) {
                        ForEach(-60...60, id: \.self) { offset in
                            if let month = Calendar.current.date(byAdding: .month, value: offset, to: anchorMonth) {
                                monthSection(month)
                            }
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 8)
                }
                .coordinateSpace(name: "calendar-month-scroll")
                .scrollIndicators(.hidden)
                .task {
                    guard !hasPositionedInitialMonth else { return }
                    hasPositionedInitialMonth = true
                    await Task.yield()
                    proxy.scrollTo(ScheduleFormat.monthKey(anchorMonth), anchor: .top)
                    try? await Task.sleep(for: .milliseconds(180))
                    reportedMonthKey = ScheduleFormat.monthKey(anchorMonth)
                    isTrackingVisibleMonth = true
                }
                .onPreferenceChange(MonthSectionOffsetPreferenceKey.self) { offsets in
                    guard isTrackingVisibleMonth,
                          let topMonthKey = offsets
                        .filter({ $0.value <= 12 })
                        .max(by: { $0.value < $1.value })?
                        .key,
                          topMonthKey != reportedMonthKey,
                          let month = ScheduleFormat.monthDate(topMonthKey) else {
                        return
                    }
                    reportedMonthKey = topMonthKey
                    onVisibleMonth(month)
                }
                .accessibilityIdentifier("calendar-month-grid")
            }
        }
    }

    private func monthSection(_ month: Date) -> some View {
        let key = ScheduleFormat.monthKey(month)
        let entries = monthEntries(for: month)
        let leadingBlanks = Calendar.current.component(.weekday, from: month) - 1

        return VStack(alignment: .leading, spacing: 10) {
            Text(ScheduleFormat.monthTitle(month))
                .font(.title2.weight(.bold))
                .foregroundStyle(.primary)
                .padding(.leading, 4)
                .accessibilityIdentifier("calendar-month-label-\(key)")

            LazyVGrid(columns: columns, spacing: 2) {
                ForEach(0..<leadingBlanks, id: \.self) { index in
                    Color.clear
                        .frame(height: 82)
                        .accessibilityHidden(true)
                        .id("\(key)-leading-\(index)")
                }

                ForEach(entries, id: \.day.key) { entry in
                                MonthDayCell(
                                    day: entry.day,
                                    tasks: entry.tasks,
                                    onSelectDate: onSelectDate,
                                    onCreateDate: onCreateDate,
                                    onTaskTap: onTaskTap
                                )
                    .frame(height: 82)
                }
            }
        }
        .id(key)
        .background {
            GeometryReader { geometry in
                Color.clear.preference(
                    key: MonthSectionOffsetPreferenceKey.self,
                    value: [key: geometry.frame(in: .named("calendar-month-scroll")).minY]
                )
            }
        }
    }

    private func monthEntries(for month: Date) -> [MonthDayEntry] {
        let key = ScheduleFormat.monthKey(month)
        let taskMap = taskMap(for: weeksByMonth[key] ?? [])
        let components = Calendar.current.dateComponents([.year, .month], from: month)
        guard let year = components.year,
              let monthNumber = components.month,
              let dayRange = Calendar.current.range(of: .day, in: .month, for: month) else {
            return []
        }

        return dayRange.map { dayNumber in
            let dayKey = String(format: "%04d-%02d-%02d", year, monthNumber, dayNumber)
            return MonthDayEntry(
                day: CalendarDay(key: dayKey, day: dayNumber, inMonth: true),
                tasks: taskMap[dayKey] ?? []
            )
        }
    }

    private func taskMap(for weeks: [CalendarWeek]) -> [String: [ScheduleTask]] {
        var result: [String: [ScheduleTask]] = [:]
        for week in weeks {
            for (index, day) in week.days.enumerated() where day.inMonth {
                result[day.key] = week.segments
                    .filter { index + 1 >= $0.colStart && index + 1 < $0.colStart + $0.colSpan }
                    .sorted { $0.lane < $1.lane }
                    .map(\.item)
            }
        }
        return result
    }
}

private struct MonthDayEntry {
    let day: CalendarDay
    let tasks: [ScheduleTask]
}

private struct MonthSectionOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: [String: CGFloat] = [:]

    static func reduce(value: inout [String: CGFloat], nextValue: () -> [String: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, newValue in newValue })
    }
}

private struct MonthDayCell: View {
    @Environment(\.colorScheme) private var colorScheme

    let day: CalendarDay
    let tasks: [ScheduleTask]
    let onSelectDate: (Date) -> Void
    let onCreateDate: (Date) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Button {
                if let date = ScheduleFormat.date(day.key) { onSelectDate(date) }
            } label: {
                Text("\(day.day)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(
                        isToday
                            ? Color.white
                            : day.inMonth ? Color.primary : Color.secondary.opacity(0.45)
                    )
                    .frame(width: 28, height: 28)
                    .background(isToday ? Color.primary.opacity(0.8) : .clear, in: Circle())
            }
            .accessibilityIdentifier("calendar-month-date-\(day.key)")
            .accessibilityValue(isToday ? "今天" : day.key)

            ForEach(tasks.prefix(3)) { task in
                let style = SchedulePriorityStyle(priority: task.priority, colorScheme: colorScheme)
                Button { onTaskTap(task) } label: {
                    Text(task.title)
                        .font(.system(size: 9, weight: .medium))
                        .lineLimit(1)
                        .foregroundStyle(style.foreground)
                        .padding(.horizontal, 3)
                        .frame(maxWidth: .infinity, minHeight: 15, alignment: .leading)
                        .background(style.background, in: RoundedRectangle(cornerRadius: 4))
                }
                .buttonStyle(.plain)
            }

            if tasks.count > 3 {
                Text("+\(tasks.count - 3)")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .padding(.leading, 3)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .opacity(day.inMonth ? 1 : 0.42)
        .background {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if let date = ScheduleFormat.date(day.key) {
                        onCreateDate(date)
                    }
                }
        }
        .overlay(alignment: .bottom) {
            Button {
                if let date = ScheduleFormat.date(day.key) {
                    onCreateDate(date)
                }
            } label: {
                Color.clear
                    .contentShape(Rectangle())
                    .frame(maxWidth: .infinity)
                    .frame(height: monthBlankTapHeight)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("在\(day.day)日添加任务")
            .accessibilityIdentifier("calendar-month-create-\(day.key)")
        }
    }

    private var isToday: Bool {
        guard let date = ScheduleFormat.date(day.key) else { return false }
        return Calendar.current.isDateInToday(date)
    }

    private var monthBlankTapHeight: CGFloat {
        switch tasks.count {
        case 0: 42
        case 1: 24
        default: 10
        }
    }
}

private struct YearScheduleView: View {
    let year: Int
    let monthsByYear: [Int: [CalendarMonthSummary]]
    let onSelectMonth: (Int, Int) -> Void
    let onVisibleYear: (Int) -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)
    @State private var reportedYear: Int
    @State private var hasPositionedInitialYear = false
    @State private var isTrackingVisibleYear = false
    @State private var hasUserInitiatedScroll = false
    @State private var firstYear: Int
    @State private var lastYear: Int

    init(
        year: Int,
        monthsByYear: [Int: [CalendarMonthSummary]],
        onSelectMonth: @escaping (Int, Int) -> Void,
        onVisibleYear: @escaping (Int) -> Void
    ) {
        self.year = year
        self.monthsByYear = monthsByYear
        self.onSelectMonth = onSelectMonth
        self.onVisibleYear = onVisibleYear
        _reportedYear = State(initialValue: year)
        _firstYear = State(initialValue: year - 100)
        _lastYear = State(initialValue: year + 100)
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical) {
                LazyVStack(spacing: 22) {
                    ForEach(firstYear...lastYear, id: \.self) { displayedYear in
                        VStack(alignment: .leading, spacing: 12) {
                            Text("\(displayedYear)年")
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.primary)
                                .padding(.leading, 4)
                                .accessibilityIdentifier("calendar-year-label-\(displayedYear)")

                            LazyVGrid(columns: columns, spacing: 12) {
                                ForEach(1...12, id: \.self) { month in
                                    YearMonthCard(
                                        year: displayedYear,
                                        month: month,
                                        summary: summary(for: month, in: displayedYear),
                                        onTap: { onSelectMonth(displayedYear, month) }
                                    )
                                    .accessibilityIdentifier("calendar-year-month-\(displayedYear)-\(month)")
                                }
                            }
                        }
                        .id(displayedYear)
                        .background {
                            GeometryReader { geometry in
                                Color.clear.preference(
                                    key: YearSectionOffsetPreferenceKey.self,
                                    value: [
                                        displayedYear: geometry.frame(in: .named("calendar-year-scroll")).minY
                                    ]
                                )
                            }
                        }
                    }
                }
                .scrollTargetLayout()
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .coordinateSpace(name: "calendar-year-scroll")
            .scrollIndicators(.hidden)
            .simultaneousGesture(
                DragGesture(minimumDistance: 8)
                    .onChanged { _ in hasUserInitiatedScroll = true }
            )
            .task {
                guard !hasPositionedInitialYear else { return }
                hasPositionedInitialYear = true
                await Task.yield()
                proxy.scrollTo(year, anchor: .top)
                try? await Task.sleep(for: .milliseconds(180))
                reportedYear = year
                isTrackingVisibleYear = true
            }
            .onPreferenceChange(YearSectionOffsetPreferenceKey.self) { offsets in
                guard isTrackingVisibleYear,
                      hasUserInitiatedScroll,
                      let topYear = offsets
                    .filter({ $0.value <= 12 })
                    .max(by: { $0.value < $1.value })?
                    .key,
                      topYear != reportedYear else {
                    return
                }
                reportedYear = topYear
                onVisibleYear(topYear)
            }
            .accessibilityIdentifier("calendar-year-grid")
        }
    }

    private func summary(for month: Int, in year: Int) -> CalendarMonthSummary? {
        monthsByYear[year]?.first(where: { $0.month == month })
    }
}

private struct YearSectionOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: [Int: CGFloat] = [:]

    static func reduce(value: inout [Int: CGFloat], nextValue: () -> [Int: CGFloat]) {
        value.merge(nextValue(), uniquingKeysWith: { _, newValue in newValue })
    }
}

private struct YearMonthCard: View {
    let year: Int
    let month: Int
    let summary: CalendarMonthSummary?
    let onTap: () -> Void

    private let columns = Array(repeating: GridItem(.flexible(), spacing: 2), count: 7)

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("\(month)月").font(.caption.bold())
                    Spacer()
                    if let count = summary?.taskCount, count > 0 {
                        Text("\(count)").font(.caption2).foregroundStyle(.secondary)
                    }
                }

                LazyVGrid(columns: columns, spacing: 2) {
                    ForEach(0..<leadingBlanks, id: \.self) { _ in
                        Color.clear.aspectRatio(1, contentMode: .fit)
                    }
                    ForEach(days) { day in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(heatColor(day.taskCount))
                            .aspectRatio(1, contentMode: .fit)
                    }
                }
            }
            .padding(10)
            .background(TimiaTheme.field, in: RoundedRectangle(cornerRadius: 15))
            .overlay {
                if isCurrentMonth {
                    RoundedRectangle(cornerRadius: 15).stroke(Color.primary.opacity(0.55), lineWidth: 1.5)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var days: [CalendarHeatDay] { summary?.days ?? [] }
    private var leadingBlanks: Int {
        guard let date = Calendar.current.date(from: DateComponents(year: year, month: month, day: 1)) else { return 0 }
        return Calendar.current.component(.weekday, from: date) - 1
    }
    private var isCurrentMonth: Bool {
        let now = Date()
        return Calendar.current.component(.year, from: now) == year
            && Calendar.current.component(.month, from: now) == month
    }
    private func heatColor(_ count: Int) -> Color {
        switch count {
        case 0: TimiaTheme.border.opacity(0.28)
        case 1: TimiaTheme.primary.opacity(0.32)
        case 2: TimiaTheme.primary.opacity(0.55)
        default: TimiaTheme.primary.opacity(0.85)
        }
    }
}

private struct TodoScheduleView: View {
    @Environment(\.colorScheme) private var colorScheme

    let columns: [String: [ScheduleTask]]
    let totals: [String: Int]
    let hasMore: [String: Bool]
    let loadingStatuses: Set<String>
    let onLoadMore: (String) -> Void
    let onTaskTap: (ScheduleTask) -> Void

    private let statuses = [
        ("todo", "待办", "circle"),
        ("doing", "进行中", "clock"),
        ("done", "已完成", "checkmark.circle"),
        ("archived", "已归档", "archivebox")
    ]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                ForEach(statuses, id: \.0) { status, label, symbol in
                    let tasks = columns[status] ?? []
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Label(label, systemImage: symbol).font(.headline)
                            Spacer()
                            Text("\(totals[status] ?? tasks.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        ForEach(tasks) { task in
                            let style = SchedulePriorityStyle(
                                priority: task.priority,
                                colorScheme: colorScheme
                            )
                            Button { onTaskTap(task) } label: {
                                HStack(alignment: .center, spacing: 12) {
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(task.title)
                                            .font(.subheadline.weight(.semibold))
                                            .lineLimit(2)
                                        Text(ScheduleFormat.todoTimeRange(task))
                                            .font(.caption)
                                            .lineLimit(1)
                                            .opacity(0.78)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)

                                    Spacer()

                                    VStack(alignment: .trailing, spacing: 5) {
                                        Text(task.workspaceName)
                                        Text(task.projectName)
                                    }
                                    .font(.caption.weight(.medium))
                                    .lineLimit(1)
                                    .frame(width: 108, alignment: .trailing)
                                    .opacity(0.82)
                                }
                                .foregroundStyle(style.foreground)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 12)
                                .background(style.background, in: RoundedRectangle(cornerRadius: 14))
                                .overlay(alignment: .leading) {
                                    Capsule()
                                        .fill(style.accent)
                                        .frame(width: 4)
                                        .padding(.vertical, 8)
                                }
                            }
                            .buttonStyle(.plain)
                        }

                        if hasMore[status] == true {
                            Button {
                                onLoadMore(status)
                            } label: {
                                HStack(spacing: 7) {
                                    if loadingStatuses.contains(status) {
                                        ProgressView().controlSize(.small)
                                    } else {
                                        Image(systemName: "chevron.down")
                                    }
                                    let remaining = max(
                                        (totals[status] ?? tasks.count) - tasks.count,
                                        0
                                    )
                                    Text("展开更多\(remaining > 0 ? "（剩余 \(remaining)）" : "")")
                                }
                                .font(.caption.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                                .background(TimiaTheme.field, in: Capsule())
                            }
                            .buttonStyle(.plain)
                            .disabled(loadingStatuses.contains(status))
                            .accessibilityLabel("加载更多\(label)任务")
                        }

                        if tasks.isEmpty {
                            Text("暂无任务").font(.caption).foregroundStyle(.tertiary).padding(.vertical, 6)
                        }
                    }
                    .padding(14)
                    .background(TimiaTheme.surface, in: RoundedRectangle(cornerRadius: 18))
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(TimiaTheme.border.opacity(0.45)))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(TimiaTheme.canvas)
    }
}

private struct NaturalLanguageConfirmationView: View {
    let response: NaturalLanguageParseResponse
    let onCreated: () -> Void

    @EnvironmentObject private var session: AppSession
    @Environment(\.dismiss) private var dismiss
    @State private var draft: NaturalLanguageTaskDraft
    @State private var workspaces: [WorkspaceCard] = []
    @State private var projects: [Project] = []
    @State private var workspaceId = ""
    @State private var projectId = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(response: NaturalLanguageParseResponse, onCreated: @escaping () -> Void) {
        self.response = response
        self.onCreated = onCreated
        _draft = State(initialValue: response.draft)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("解析结果") {
                    TextField("标题", text: $draft.title)
                    TextField("说明", text: optionalBinding(\.body), axis: .vertical).lineLimit(2...5)
                    TextField("地点", text: optionalBinding(\.location))
                    LabeledContent("置信度", value: "\(Int(response.confidence * 100))%")
                }

                Section("时间") {
                    Toggle("全天", isOn: $draft.allDay)
                    if let start = ScheduleFormat.parseISO(draft.startAt) {
                        LabeledContent("开始", value: ScheduleFormat.fullDateTime(start))
                    }
                    if let end = ScheduleFormat.parseISO(draft.endAt) {
                        LabeledContent("结束", value: ScheduleFormat.fullDateTime(end))
                    }
                    if let recurrence = draft.recurrenceText, !recurrence.isEmpty {
                        LabeledContent("重复", value: recurrence)
                    }
                }

                Section("保存到") {
                    Picker("空间", selection: $workspaceId) {
                        Text("请选择").tag("")
                        ForEach(workspaces) { Text($0.name).tag($0.id) }
                    }
                    .onChange(of: workspaceId) { _, _ in Task { await loadProjects() } }
                    Picker("项目", selection: $projectId) {
                        Text("请选择").tag("")
                        ForEach(projects) { Text($0.name).tag($0.id) }
                    }
                }

                if !response.assumptions.isEmpty || !response.ambiguities.isEmpty {
                    Section("请确认") {
                        ForEach(response.assumptions + response.ambiguities, id: \.self) {
                            Label($0, systemImage: "exclamationmark.bubble").font(.subheadline)
                        }
                    }
                }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
            .navigationTitle("确认新任务")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "创建中…" : "创建") { Task { await createTask() } }
                        .disabled(isSaving || draft.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || projectId.isEmpty)
                }
            }
            .task { await loadWorkspaces() }
        }
    }

    private func optionalBinding(_ keyPath: WritableKeyPath<NaturalLanguageTaskDraft, String?>) -> Binding<String> {
        Binding(
            get: { draft[keyPath: keyPath] ?? "" },
            set: { draft[keyPath: keyPath] = $0.isEmpty ? nil : $0 }
        )
    }

    private func loadWorkspaces() async {
        do {
            workspaces = try await session.api.request("/workspaces/cards", response: [WorkspaceCard].self)
            if let named = draft.workspaceName,
               let match = workspaces.first(where: { $0.name.localizedCaseInsensitiveCompare(named) == .orderedSame }) {
                workspaceId = match.id
            } else {
                workspaceId = workspaces.first?.id ?? ""
            }
            await loadProjects()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func loadProjects() async {
        guard !workspaceId.isEmpty else {
            projects = []
            projectId = ""
            return
        }
        do {
            projects = try await session.api.request("/workspaces/\(workspaceId)/projects", response: [Project].self)
            if let named = draft.projectName,
               let match = projects.first(where: { $0.name.localizedCaseInsensitiveCompare(named) == .orderedSame }) {
                projectId = match.id
            } else if !projects.contains(where: { $0.id == projectId }) {
                projectId = projects.first?.id ?? ""
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func createTask() async {
        guard !workspaceId.isEmpty, !projectId.isEmpty else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            _ = try await session.api.request(
                "/workspaces/\(workspaceId)/projects/\(projectId)/items",
                method: "POST",
                body: ItemPayload(
                    title: draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
                    body: draft.body,
                    color: "#FFFFFF",
                    status: draft.status,
                    priority: draft.priority,
                    startAt: draft.startAt,
                    endAt: draft.endAt,
                    details: recurrenceDetails,
                    location: draft.location
                ),
                response: ItemResponse.self
            )
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private var recurrenceDetails: String? {
        guard let recurrence = draft.recurrenceText, !recurrence.isEmpty else { return nil }
        return "重复：\(recurrence)"
    }
}

private struct DashedDivider: View {
    var body: some View {
        Line()
            .stroke(TimiaTheme.border.opacity(0.52), style: StrokeStyle(lineWidth: 0.7, dash: [3, 4]))
            .frame(height: 1)
    }

    private struct Line: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return path
        }
    }
}

private enum ScheduleFormat {
    struct Placement {
        let dayIndex: Int
        let startMinutes: Int
        let durationMinutes: Int
    }

    static func dayKey(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    static func date(_ key: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: key)
    }

    static func monthTitle(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month], from: date)
        return String(format: "%04d年%02d月", components.year ?? 0, components.month ?? 0)
    }

    static func fullDateLabel(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d年%02d月%02d日",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    static func monthKey(_ date: Date) -> String {
        let components = Calendar.current.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", components.year ?? 0, components.month ?? 0)
    }

    static func monthDate(_ key: String) -> Date? {
        let values = key.split(separator: "-")
        guard values.count == 2,
              let year = Int(values[0]),
              let month = Int(values[1]) else {
            return nil
        }
        return Calendar.current.date(from: DateComponents(year: year, month: month, day: 1))
    }

    static func weekdayLetter(_ date: Date) -> String {
        let values = ["日", "一", "二", "三", "四", "五", "六"]
        return values[Calendar.current.component(.weekday, from: date) - 1]
    }

    static func week(containing date: Date) -> [Date] {
        let calendar = Calendar.current
        let weekday = calendar.component(.weekday, from: date)
        let start = calendar.date(byAdding: .day, value: -(weekday - 1), to: calendar.startOfDay(for: date)) ?? date
        return (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    static func weekKey(_ date: Date) -> String {
        dayKey(week(containing: date).first ?? date)
    }

    static func weekLabel(_ date: Date) -> String {
        let calendar = Calendar.current
        let weekStart = week(containing: date).first ?? calendar.startOfDay(for: date)
        var weekYear = calendar.component(.year, from: weekStart)
        var firstWeekStart = firstFullWeekStart(in: weekYear, calendar: calendar)

        if weekStart < firstWeekStart {
            weekYear -= 1
            firstWeekStart = firstFullWeekStart(in: weekYear, calendar: calendar)
        }

        let elapsedDays = calendar.dateComponents([.day], from: firstWeekStart, to: weekStart).day ?? 0
        return "\(weekYear)年第\(max(1, elapsedDays / 7 + 1))周"
    }

    private static func firstFullWeekStart(in year: Int, calendar: Calendar) -> Date {
        let januaryFirst = calendar.date(from: DateComponents(year: year, month: 1, day: 1)) ?? Date()
        let weekday = calendar.component(.weekday, from: januaryFirst)
        let daysUntilSunday = (8 - weekday) % 7
        return calendar.date(byAdding: .day, value: daysUntilSunday, to: januaryFirst) ?? januaryFirst
    }

    static func parseISO(_ value: String?) -> Date? {
        guard let value else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }

    static func isAllDay(_ task: ScheduleTask) -> Bool {
        guard let start = parseISO(task.startAt), let end = parseISO(task.endAt) else {
            return task.startAt == nil
        }
        return end.timeIntervalSince(start) >= 23 * 3600
    }

    static func placement(for task: ScheduleTask, days: [Date]) -> Placement? {
        guard let start = parseISO(task.startAt),
              let dayIndex = days.firstIndex(where: { Calendar.current.isDate($0, inSameDayAs: start) }) else {
            return nil
        }
        let end = parseISO(task.endAt) ?? start.addingTimeInterval(3600)
        let components = Calendar.current.dateComponents([.hour, .minute], from: start)
        let startMinutes = max(0, (components.hour ?? 0) * 60 + (components.minute ?? 0))
        let duration = max(30, min(24 * 60 - startMinutes, Int(end.timeIntervalSince(start) / 60)))
        return Placement(dayIndex: dayIndex, startMinutes: startMinutes, durationMinutes: duration)
    }

    static func timeRange(_ task: ScheduleTask) -> String {
        guard let start = parseISO(task.startAt) else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm"
        if let end = parseISO(task.endAt) {
            return "\(formatter.string(from: start)) – \(formatter.string(from: end))"
        }
        return formatter.string(from: start)
    }

    static func todoTimeRange(_ task: ScheduleTask) -> String {
        guard let start = parseISO(task.startAt) else { return "未设置时间" }
        let end = parseISO(task.endAt)
        let dayFormatter = DateFormatter()
        dayFormatter.locale = Locale(identifier: "zh_CN")
        dayFormatter.dateFormat = "M月d日 HH:mm"
        guard let end else { return dayFormatter.string(from: start) }

        if Calendar.current.isDate(start, inSameDayAs: end) {
            let timeFormatter = DateFormatter()
            timeFormatter.locale = Locale(identifier: "zh_CN")
            timeFormatter.dateFormat = "HH:mm"
            return "\(dayFormatter.string(from: start)) – \(timeFormatter.string(from: end))"
        }
        return "\(dayFormatter.string(from: start)) – \(dayFormatter.string(from: end))"
    }

    static func fullDateTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M月d日 HH:mm"
        return formatter.string(from: date)
    }
}

private extension CurrentUser {
    var initials: String {
        let value = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if let first = value.first { return String(first).uppercased() }
        return String(email.prefix(1)).uppercased()
    }
}
