// swiftlint:disable file_length
import AppKit
import SwiftUI

struct ResponsePaneView: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(spacing: 0) {
            if store.selectedOperation != nil {
                // Tab bar
                HStack(spacing: 4) {
                    tabButton(.docs, label: "Docs")
                    tabButton(.response, label: "Response")
                    Spacer()
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color(.textBackgroundColor).opacity(0.4))

                Divider()
            }

            // Content
            Group {
                if store.isSending {
                    ProgressView("요청 중...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if store.responseTab == .docs, let op = store.selectedOperation {
                    DocsPaneView(operation: op)
                } else if let err = store.sendError {
                    SendErrorView(error: err)
                } else if let response = store.response {
                    ResponseDetailView(
                        response: response,
                        curlString: store.lastCurlString,
                        lastRequest: store.lastRequest
                    )
                } else {
                    ContentUnavailableView(
                        "응답 없음",
                        systemImage: "arrow.up.arrow.down",
                        description: Text("Send를 눌러 요청을 실행하세요.")
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func tabButton(_ tab: ResponseTab, label: String) -> some View {
        let selected = store.responseTab == tab
        Button {
            store.responseTab = tab
        } label: {
            Text(label)
                .font(.system(.caption).weight(selected ? .semibold : .regular))
                .foregroundStyle(selected ? .primary : .secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(selected ? Color.primary.opacity(0.08) : Color.clear)
                .clipShape(.rect(cornerRadius: 5))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Error State

struct SendErrorView: View {
    let error: Error

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("요청 실패")
                .font(.headline)
            Text(error.localizedDescription)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Response Detail

struct ResponseDetailView: View {
    let response: HTTPResponse
    let curlString: String?
    let lastRequest: HTTPRequest?

    @AppStorage("responseFontSize") private var fontSize: Double = 11.0
    @State private var formattedBody: String = ""
    @State private var searchText = ""
    @State private var submittedQuery = ""
    @State private var matchCount = 0
    @State private var isSearchActive = false
    @State private var bodyCopied = false
    @FocusState private var isSearchFieldFocused: Bool

    private static let fontSizeRange: ClosedRange<Double> = 8 ... 32

    var body: some View {
        VStack(spacing: 0) {
            // Status bar
            HStack(spacing: 8) {
                Text("\(response.statusCode)")
                    .font(.system(.body, design: .monospaced).bold())
                    .foregroundStyle(statusColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(statusColor.opacity(0.12))
                    .clipShape(.rect(cornerRadius: 4))

                Text(HTTPURLResponse.localizedString(forStatusCode: response.statusCode))
                    .foregroundStyle(.secondary)

                Spacer()

                Text("\(response.durationMs)ms")
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)

                Text(formatSize(response.body.count))
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(formattedBody, forType: .string)
                    bodyCopied = true
                    Task {
                        try? await Task.sleep(for: .seconds(1.2))
                        bodyCopied = false
                    }
                } label: {
                    Label(bodyCopied ? "복사됨" : "Body",
                          systemImage: bodyCopied ? "checkmark" : "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("응답 본문(JSON)을 클립보드에 복사합니다.")

                if let curl = curlString {
                    Button {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(curl, forType: .string)
                    } label: {
                        Label("cURL", systemImage: "doc.on.clipboard")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("요청에 해당하는 cURL 명령을 클립보드에 복사합니다.")
                }

                if let request = lastRequest {
                    Menu {
                        ForEach(SnippetLanguage.allCases, id: \.self) { language in
                            Button {
                                let snippet = SnippetBuilder.build(request, language: language)
                                NSPasteboard.general.clearContents()
                                NSPasteboard.general.setString(snippet, forType: .string)
                            } label: {
                                Label(language.rawValue, systemImage: language.sfSymbol)
                            }
                        }
                    } label: {
                        Label("Code", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("코드 스니펫을 언어를 선택하여 클립보드에 복사합니다.")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            // Request URL row
            if let request = lastRequest {
                HStack(spacing: 6) {
                    Text(request.method.rawValue)
                        .font(.system(.caption2, design: .monospaced).bold())
                        .foregroundStyle(request.method.swiftUIColor)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(request.method.swiftUIColor.opacity(0.12))
                        .clipShape(.rect(cornerRadius: 3))
                    Text(request.url.absoluteString)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 5)
            }

            Divider()

            // Search bar (visible when isSearchActive) — Enter로 검색 실행(입력 중 버벅임 방지)
            if isSearchActive {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("검색 후 Enter", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(.system(.caption))
                        .focused($isSearchFieldFocused)
                        .onSubmit { submittedQuery = searchText }
                    if !submittedQuery.isEmpty {
                        Text(matchCount == 0 ? "일치 없음" : "\(matchCount)개 일치")
                            .font(.caption2)
                            .foregroundStyle(matchCount == 0 ? .red : .secondary)
                    }
                    Button {
                        searchText = ""
                        submittedQuery = ""
                        isSearchActive = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(.bar)
                Divider()
            }

            // Request Headers + Body (collapsible)
            if let req = lastRequest {
                SentRequestSection(request: req)
                Divider()
            }

            // Response Headers (fixed at top)
            if !response.headers.isEmpty {
                ResponseHeadersSection(headers: response.headers, title: "Response Headers")
                Divider()
            }

            // Response Body — NSTextView 기반(대용량 JSON 렌더/스크롤 빠름, 검색은 Enter 시 하이라이트)
            CodeTextView(
                text: formattedBody,
                fontSize: fontSize,
                searchQuery: submittedQuery,
                onMatchCount: { matchCount = $0 }
            )
        }
        .task(id: response.body) {
            let data = response.body
            // Show raw bytes immediately so there's no blank period
            let raw = String(data: data, encoding: .utf8) ?? ""
            formattedBody = raw.count > 1_000_000 ? String(raw.prefix(1_000_000)) + "\n...(truncated)" : raw
            // Replace with pretty-printed version once background task finishes
            let result = await Task.detached(priority: .userInitiated) {
                Self.formatBody(data)
            }.value
            formattedBody = result
        }
        .overlay(
            Button("") {
                isSearchActive.toggle()
                if isSearchActive {
                    isSearchFieldFocused = true
                } else {
                    searchText = ""
                    submittedQuery = ""
                }
            }
            .keyboardShortcut("f", modifiers: .command)
            .opacity(0)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        )
    }

    private static func formatBody(_ data: Data) -> String {
        let rawStr = String(data: data, encoding: .utf8) ?? ""
        guard let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8)
        else {
            return rawStr.count > 1_000_000
                ? String(rawStr.prefix(1_000_000)) + "\n...(truncated)"
                : rawStr
        }
        return str.count > 1_000_000
            ? String(str.prefix(1_000_000)) + "\n...(truncated)"
            : str
    }

    private var statusColor: Color {
        .httpStatus(response.statusCode)
    }

    private func formatSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.1f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
}

// MARK: - Response Headers Section

struct ResponseHeadersSection: View {
    let headers: [String: String]
    var title: String = "Headers"
    @State private var isExpanded = true

    var sorted: [(key: String, value: String)] {
        headers.sorted { $0.key < $1.key }
    }

    var body: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) { isExpanded.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(title)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("\(headers.count)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                    Spacer()
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(spacing: 0) {
                    ForEach(sorted, id: \.key) { item in
                        HStack(alignment: .top, spacing: 8) {
                            Text(item.key)
                                .font(.system(.caption, design: .monospaced).bold())
                                .foregroundStyle(.primary)
                                .frame(width: 160, alignment: .leading)
                            Text(item.value)
                                .font(.system(.caption, design: .monospaced))
                                .foregroundStyle(.secondary)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 3)
                    }
                    .padding(.bottom, 4)
                }
            }
        }
        .background(Color(.textBackgroundColor).opacity(0.2))
    }
}

// MARK: - Code Text View (NSTextView + 미니맵)

/// 큰 JSON도 빠르게 렌더/스크롤하기 위해 SwiftUI Text 대신 NSTextView(TextKit)를 사용한다.
/// 오른쪽에 코드 미니맵을 두어 전체 구조·뷰포트·검색 매치를 표시한다.
/// `searchQuery`가 바뀔 때(= Enter로 검색 제출할 때)만 전체 매치를 하이라이트한다.
struct CodeTextView: NSViewRepresentable {
    let text: String
    let fontSize: Double
    var searchQuery: String = ""
    var onMatchCount: ((Int) -> Void)?

    private static let minimapWidth: CGFloat = 60

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> NSView {
        let container = NSView()

        let scrollView = NSTextView.scrollableTextView()
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = true
        scrollView.autohidesScrollers = true
        scrollView.drawsBackground = false
        scrollView.translatesAutoresizingMaskIntoConstraints = false

        let textView = scrollView.documentView as? NSTextView
        if let textView {
            textView.isEditable = false
            textView.isSelectable = true
            textView.drawsBackground = false
            textView.isRichText = false
            textView.usesFindBar = true
            textView.textContainerInset = NSSize(width: 8, height: 8)
            textView.isAutomaticQuoteSubstitutionEnabled = false
            textView.textColor = .labelColor
            textView.font = .monospacedSystemFont(ofSize: fontSize, weight: .regular)

            // 줄바꿈(wrap) 비활성화 → 가로 스크롤. 패널 폭 변경 시 전체 재레이아웃이 없어
            // divider 드래그가 부드러워진다(코드 뷰어 표준).
            textView.isHorizontallyResizable = true
            textView.isVerticallyResizable = true
            textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude,
                                      height: CGFloat.greatestFiniteMagnitude)
            textView.textContainer?.widthTracksTextView = false
            textView.textContainer?.containerSize = NSSize(
                width: CGFloat.greatestFiniteMagnitude,
                height: CGFloat.greatestFiniteMagnitude
            )
        }

        let minimap = MinimapView()
        minimap.scrollView = scrollView
        minimap.translatesAutoresizingMaskIntoConstraints = false

        container.addSubview(scrollView)
        container.addSubview(minimap)
        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: container.topAnchor),
            scrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: minimap.leadingAnchor),
            minimap.topAnchor.constraint(equalTo: container.topAnchor),
            minimap.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            minimap.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            minimap.widthAnchor.constraint(equalToConstant: Self.minimapWidth)
        ])

        // 스크롤할 때마다 미니맵 뷰포트 인디케이터 갱신
        scrollView.contentView.postsBoundsChangedNotifications = true
        context.coordinator.scrollObserver = NotificationCenter.default.addObserver(
            forName: NSView.boundsDidChangeNotification,
            object: scrollView.contentView,
            queue: .main
        ) { [weak minimap] _ in
            minimap?.needsDisplay = true
        }

        context.coordinator.textView = textView
        context.coordinator.minimap = minimap
        return container
    }

    func updateNSView(_: NSView, context: Context) {
        let coordinator = context.coordinator
        guard let textView = coordinator.textView else { return }
        let font = NSFont.monospacedSystemFont(ofSize: fontSize, weight: .regular)

        // 본문이 바뀐 경우에만 재설정(매 업데이트마다 하면 비쌈)
        if coordinator.lastText != text {
            textView.string = text
            textView.font = font
            textView.textColor = .labelColor
            coordinator.lastText = text
            coordinator.lastQuery = nil
            coordinator.minimap?.update(text: text, matchLines: [])
        } else if textView.font != font {
            textView.font = font
        }

        // 검색어가 바뀐 경우에만 하이라이트(=Enter로 제출했을 때)
        if coordinator.lastQuery != searchQuery {
            coordinator.lastQuery = searchQuery
            let (count, matchLines) = coordinator.highlight(query: searchQuery)
            coordinator.minimap?.matchLines = matchLines
            coordinator.minimap?.needsDisplay = true
            onMatchCount?(count)
        }
    }

    static func dismantleNSView(_: NSView, coordinator: Coordinator) {
        if let observer = coordinator.scrollObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    final class Coordinator {
        weak var textView: NSTextView?
        weak var minimap: MinimapView?
        var scrollObserver: NSObjectProtocol?
        var lastText = ""
        var lastQuery: String?

        /// 전체 매치를 하이라이트하고 첫 매치로 스크롤. (매치 개수, 매치가 있는 라인 인덱스 집합) 반환.
        func highlight(query: String) -> (count: Int, lines: Set<Int>) {
            guard let textView, let storage = textView.textStorage else { return (0, []) }
            let nsString = textView.string as NSString
            let fullRange = NSRange(location: 0, length: nsString.length)

            storage.beginEditing()
            storage.removeAttribute(.backgroundColor, range: fullRange)
            storage.addAttribute(.foregroundColor, value: NSColor.labelColor, range: fullRange)

            guard !query.isEmpty else {
                storage.endEditing()
                return (0, [])
            }

            var searchRange = NSRange(location: 0, length: nsString.length)
            var count = 0
            var firstMatch: NSRange?
            var matchLines = Set<Int>()
            // 매치 위치 → 라인 번호를 증분으로 계산(전체 O(n))
            var scannedLocation = 0
            var currentLine = 0

            while searchRange.location < nsString.length {
                let found = nsString.range(of: query, options: .caseInsensitive, range: searchRange)
                if found.location == NSNotFound { break }
                storage.addAttribute(.backgroundColor, value: NSColor.systemYellow, range: found)
                storage.addAttribute(.foregroundColor, value: NSColor.black, range: found)
                if firstMatch == nil { firstMatch = found }

                if found.location > scannedLocation {
                    let segment = nsString.substring(
                        with: NSRange(location: scannedLocation, length: found.location - scannedLocation)
                    )
                    for character in segment where character == "\n" {
                        currentLine += 1
                    }
                    scannedLocation = found.location
                }
                matchLines.insert(currentLine)

                count += 1
                let nextLocation = found.location + max(found.length, 1)
                searchRange = NSRange(location: nextLocation, length: nsString.length - nextLocation)
            }
            storage.endEditing()

            if let firstMatch { textView.scrollRangeToVisible(firstMatch) }
            return (count, matchLines)
        }
    }
}

// MARK: - 코드 미니맵

/// 텍스트를 라인 단위로 축소 렌더링하는 미니맵. 뷰포트 위치와 검색 매치 라인을 표시하고,
/// 클릭/드래그로 해당 위치로 스크롤한다.
final class MinimapView: NSView {
    weak var scrollView: NSScrollView?
    private var lineLengths: [Int] = []
    var matchLines: Set<Int> = []

    override var isFlipped: Bool {
        true
    }

    func update(text: String, matchLines: Set<Int>) {
        // 라인별 길이(표시는 너무 길면 잘림). 매우 큰 문서는 라인 수만 정확하면 충분.
        lineLengths = text.split(separator: "\n", omittingEmptySubsequences: false).map(\.count)
        self.matchLines = matchLines
        needsDisplay = true
    }

    override func draw(_: NSRect) {
        let totalLines = max(lineLengths.count, 1)
        let height = bounds.height
        let width = bounds.width
        guard height > 0, !lineLengths.isEmpty else { return }

        // 배경
        NSColor.black.withAlphaComponent(0.12).setFill()
        bounds.fill()

        let lineHeight = max(height / CGFloat(totalLines), 0.7)
        let maxLen = CGFloat(max(lineLengths.max() ?? 1, 1))
        let usableWidth = width - 8
        let charWidth = usableWidth / max(maxLen, 30) // 30자 기준 스케일(짧은 문서도 보기 좋게)

        let dimColor = NSColor.secondaryLabelColor.withAlphaComponent(0.4)
        let matchColor = NSColor.systemYellow

        for (index, length) in lineLengths.enumerated() {
            let y = CGFloat(index) * lineHeight
            if matchLines.contains(index) {
                matchColor.setFill()
                NSRect(x: 3, y: y, width: max(usableWidth, 4), height: max(lineHeight - 0.3, 1)).fill()
            } else if length > 0 {
                dimColor.setFill()
                let barWidth = min(CGFloat(length) * charWidth, usableWidth)
                NSRect(x: 4, y: y, width: barWidth, height: max(lineHeight * 0.55, 0.7)).fill()
            }
        }

        // 현재 뷰포트 인디케이터
        if let scrollView, let documentView = scrollView.documentView {
            let visible = scrollView.contentView.bounds
            let documentHeight = documentView.bounds.height
            if documentHeight > 0 {
                let top = visible.minY / documentHeight * height
                let viewportHeight = min(visible.height / documentHeight * height, height)
                NSColor.white.withAlphaComponent(0.14).setFill()
                NSRect(x: 0, y: top, width: width, height: viewportHeight).fill()
                NSColor.separatorColor.setStroke()
                let border = NSBezierPath(rect: NSRect(x: 0.5, y: top + 0.5,
                                                       width: width - 1, height: max(viewportHeight - 1, 1)))
                border.lineWidth = 1
                border.stroke()
            }
        }
    }

    override func mouseDown(with event: NSEvent) {
        scrollToPoint(event)
    }

    override func mouseDragged(with event: NSEvent) {
        scrollToPoint(event)
    }

    private func scrollToPoint(_ event: NSEvent) {
        guard let scrollView, let documentView = scrollView.documentView else { return }
        let point = convert(event.locationInWindow, from: nil)
        let fraction = max(0, min(1, point.y / bounds.height))
        let target = fraction * documentView.bounds.height - scrollView.contentView.bounds.height / 2
        documentView.scroll(NSPoint(x: 0, y: max(0, target)))
        scrollView.reflectScrolledClipView(scrollView.contentView)
        needsDisplay = true
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }
}

// swiftlint:enable file_length
