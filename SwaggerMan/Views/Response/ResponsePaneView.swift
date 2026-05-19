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
    @State private var isSearchActive = false
    @FocusState private var isSearchFieldFocused: Bool

    private static let fontSizeRange: ClosedRange<Double> = 8 ... 32

    private var searchResult: (body: AttributedString, count: Int) {
        let text = formattedBody
        guard !searchText.isEmpty else { return (AttributedString(), 0) }

        var result = AttributedString()
        var count = 0
        var searchStart = text.startIndex

        while searchStart < text.endIndex,
              let found = text.range(
                  of: searchText,
                  options: .caseInsensitive,
                  range: searchStart ..< text.endIndex
              )
        {
            let prefix = String(text[searchStart ..< found.lowerBound])
            if !prefix.isEmpty { result += AttributedString(prefix) }

            var highlight = AttributedString(String(text[found]))
            highlight.backgroundColor = Color.yellow
            highlight.foregroundColor = Color.black
            result += highlight
            count += 1

            searchStart = found.upperBound
        }

        if searchStart < text.endIndex {
            result += AttributedString(String(text[searchStart...]))
        }

        return (result, count)
    }

    private var highlightedBody: AttributedString {
        searchResult.body
    }

    private var matchCount: Int {
        searchResult.count
    }

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

            // Search bar (visible when isSearchActive)
            if isSearchActive {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("검색...", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(.system(.caption))
                        .focused($isSearchFieldFocused)
                    if !searchText.isEmpty {
                        Text(matchCount == 0 ? "일치 없음" : "\(matchCount)개 일치")
                            .font(.caption2)
                            .foregroundStyle(matchCount == 0 ? .red : .secondary)
                    }
                    Button {
                        searchText = ""
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

            // Response Body (scrollable, fills remaining space)
            ScrollView {
                Group {
                    if searchText.isEmpty {
                        Text(formattedBody)
                    } else {
                        Text(highlightedBody)
                    }
                }
                .font(.system(size: fontSize, design: .monospaced))
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
                .padding(12)
            }
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
                if isSearchActive { isSearchFieldFocused = true } else { searchText = "" }
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
