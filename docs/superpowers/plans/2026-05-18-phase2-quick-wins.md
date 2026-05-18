# Phase 2 — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 응답 패널에 ⌘F 키워드 검색(하이라이트)과 Swift/Python/JavaScript 코드 스니펫 복사 기능을 추가한다.

**Architecture:** 코드 스니펫은 `CurlBuilder` 패턴을 따르는 `SnippetBuilder` 서비스로 구현. `RequestEditorStore`에 `lastRequest: HTTPRequest?` 저장 후 UI에서 on-demand 생성. 검색은 `ResponseDetailView`의 `@State` 로컬 상태와 `AttributedString` 하이라이트로 구현하며 ⌘F로 토글.

**Tech Stack:** Swift 5.9, SwiftUI, macOS 14+, `AttributedString`, Swift Testing

---

## 현재 상태 확인

- `ResponseDetailView(response:curlString:)` — `HTTPResponse` + `String?` 파라미터만 있음
- `ResponsePaneView(@Bindable var store: RequestEditorStore)` — store에 직접 접근
- `CurlBuilder.build(_:options:)` — `HTTPRequest` → `String` 변환 패턴
- `RequestEditorStore.lastCurlString: String?` — `send` 시 세팅, `loadOperation`/`clearSelection` 시 nil

---

## 파일 구조

| 파일 | 변경 |
|---|---|
| `SwaggerMan/Services/SnippetBuilder.swift` | 신규 — `SnippetLanguage` + Swift/Python/JS 생성 로직 |
| `SwaggerMan/Stores/RequestEditorStore.swift` | 수정 — `lastRequest: HTTPRequest?` 추가 |
| `SwaggerMan/Views/Response/ResponsePaneView.swift` | 수정 — 코드 스니펫 버튼 + ⌘F 검색 바 |
| `SwaggerManTests/Services/SnippetBuilderTests.swift` | 신규 |
| `SwaggerManTests/Integration/RequestEditorStoreAdditionalTests.swift` | 수정 — `lastRequest` 테스트 추가 |

---

## Task 1: SnippetBuilder

**Files:**
- Create: `SwaggerMan/Services/SnippetBuilder.swift`
- Create: `SwaggerManTests/Services/SnippetBuilderTests.swift`

- [ ] **Step 1: 실패 테스트 작성**

`SwaggerManTests/Services/SnippetBuilderTests.swift` 생성:

```swift
import Testing
@testable import SwaggerMan

@Suite("SnippetBuilder Tests")
struct SnippetBuilderTests {
    // MARK: - Swift

    @Test("Swift GET — URLSession.shared.data(from:) 사용")
    func swiftGet() {
        let request = HTTPRequest(
            method: .get,
            url: URL(string: "https://api.example.com/users")!,
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .swift)
        #expect(snippet.contains("URLSession.shared.data(from:"))
        #expect(snippet.contains("https://api.example.com/users"))
        #expect(!snippet.contains("httpMethod"))
    }

    @Test("Swift POST — httpMethod + httpBody 포함")
    func swiftPost() {
        let body = #"{"name":"Alice"}"#.data(using: .utf8)
        let request = HTTPRequest(
            method: .post,
            url: URL(string: "https://api.example.com/users")!,
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let snippet = SnippetBuilder.build(request, language: .swift)
        #expect(snippet.contains("httpMethod = \"POST\""))
        #expect(snippet.contains("Content-Type"))
        #expect(snippet.contains("application/json"))
        #expect(snippet.contains(#"{"name":"Alice"}"#))
    }

    // MARK: - Python

    @Test("Python GET — import requests + get 함수")
    func pythonGet() {
        let request = HTTPRequest(
            method: .get,
            url: URL(string: "https://api.example.com/users")!,
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .python)
        #expect(snippet.contains("import requests"))
        #expect(snippet.contains("requests.get"))
        #expect(snippet.contains("https://api.example.com/users"))
    }

    @Test("Python POST — data= 파라미터 포함")
    func pythonPost() {
        let body = #"{"name":"Alice"}"#.data(using: .utf8)
        let request = HTTPRequest(
            method: .post,
            url: URL(string: "https://api.example.com/users")!,
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let snippet = SnippetBuilder.build(request, language: .python)
        #expect(snippet.contains("requests.post"))
        #expect(snippet.contains(#"{"name":"Alice"}"#))
    }

    @Test("Python DELETE — data= 없음")
    func pythonDelete() {
        let request = HTTPRequest(
            method: .delete,
            url: URL(string: "https://api.example.com/users/1")!,
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .python)
        #expect(snippet.contains("requests.delete"))
        #expect(!snippet.contains("data="))
    }

    // MARK: - JavaScript

    @Test("JavaScript GET — fetch URL만 포함")
    func javascriptGet() {
        let request = HTTPRequest(
            method: .get,
            url: URL(string: "https://api.example.com/users")!,
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .javascript)
        #expect(snippet.contains("fetch("))
        #expect(snippet.contains("https://api.example.com/users"))
    }

    @Test("JavaScript POST — method + body 포함")
    func javascriptPost() {
        let body = #"{"name":"Alice"}"#.data(using: .utf8)
        let request = HTTPRequest(
            method: .post,
            url: URL(string: "https://api.example.com/users")!,
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let snippet = SnippetBuilder.build(request, language: .javascript)
        #expect(snippet.contains("method: \"POST\""))
        #expect(snippet.contains("Content-Type"))
        #expect(snippet.contains(#"{"name":"Alice"}"#))
    }
}
```

- [ ] **Step 2: 빌드 실패 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/SnippetBuilderTests \
  2>&1 | grep -E "error:|cannot find" | head -5
```

Expected: `error: cannot find type 'SnippetBuilder'`

- [ ] **Step 3: SnippetBuilder 구현**

`SwaggerMan/Services/SnippetBuilder.swift` 생성:

```swift
import Foundation

enum SnippetLanguage: String, CaseIterable {
    case swift = "Swift"
    case python = "Python"
    case javascript = "JavaScript"

    var sfSymbol: String {
        switch self {
        case .swift: "swift"
        case .python: "terminal"
        case .javascript: "globe"
        }
    }
}

enum SnippetBuilder {
    static func build(_ request: HTTPRequest, language: SnippetLanguage) -> String {
        switch language {
        case .swift: buildSwift(request)
        case .python: buildPython(request)
        case .javascript: buildJavaScript(request)
        }
    }

    // MARK: - Swift URLSession

    private static func buildSwift(_ request: HTTPRequest) -> String {
        let url = request.url.absoluteString

        // Simple GET with no headers: use the shorthand data(from:) form
        if request.method == .get, request.headers.isEmpty, request.body == nil {
            return """
            let (data, response) = try await URLSession.shared.data(
                from: URL(string: "\(url)")!
            )
            let httpResponse = response as! HTTPURLResponse
            print(httpResponse.statusCode)
            print(String(data: data, encoding: .utf8) ?? "")
            """
        }

        var lines: [String] = ["var request = URLRequest(url: URL(string: \"\(url)\")!)"]

        if request.method != .get {
            lines.append("request.httpMethod = \"\(request.method.rawValue)\"")
        }

        for (key, value) in request.headers.sorted(by: { $0.key < $1.key }) {
            lines.append("request.setValue(\"\(value)\", forHTTPHeaderField: \"\(key)\")")
        }

        if let body = request.body, let bodyString = String(data: body, encoding: .utf8) {
            let escaped = bodyString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            lines.append("request.httpBody = Data(\"\(escaped)\".utf8)")
        }

        lines += [
            "",
            "let (data, response) = try await URLSession.shared.data(for: request)",
            "let httpResponse = response as! HTTPURLResponse",
            "print(httpResponse.statusCode)",
            "print(String(data: data, encoding: .utf8) ?? \"\")",
        ]

        return lines.joined(separator: "\n")
    }

    // MARK: - Python requests

    private static func buildPython(_ request: HTTPRequest) -> String {
        let url = request.url.absoluteString
        let method = request.method.rawValue.lowercased()

        var args: [String] = ["    \"\(url)\""]

        if !request.headers.isEmpty {
            let headerLines = request.headers.sorted(by: { $0.key < $1.key })
                .map { "        \"\($0.key)\": \"\($0.value)\"" }
                .joined(separator: ",\n")
            args.append("    headers={\n\(headerLines)\n    }")
        }

        if let body = request.body, let bodyString = String(data: body, encoding: .utf8) {
            let escaped = bodyString.replacingOccurrences(of: "\"", with: "\\\"")
            args.append("    data=\"\(escaped)\"")
        }

        let argsJoined = args.joined(separator: ",\n")
        return """
        import requests

        response = requests.\(method)(
        \(argsJoined),
        )
        print(response.status_code)
        print(response.json())
        """
    }

    // MARK: - JavaScript fetch

    private static func buildJavaScript(_ request: HTTPRequest) -> String {
        let url = request.url.absoluteString

        // Simple GET with no headers or body
        if request.method == .get, request.headers.isEmpty, request.body == nil {
            return """
            const response = await fetch("\(url)");
            const data = await response.json();
            console.log(response.status, data);
            """
        }

        var options: [String] = []

        if request.method != .get {
            options.append("  method: \"\(request.method.rawValue)\"")
        }

        if !request.headers.isEmpty {
            let headerLines = request.headers.sorted(by: { $0.key < $1.key })
                .map { "    \"\($0.key)\": \"\($0.value)\"" }
                .joined(separator: ",\n")
            options.append("  headers: {\n\(headerLines)\n  }")
        }

        if let body = request.body, let bodyString = String(data: body, encoding: .utf8) {
            let escaped = bodyString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            options.append("  body: \"\(escaped)\"")
        }

        let optionsJoined = options.joined(separator: ",\n")
        return """
        const response = await fetch("\(url)", {
        \(optionsJoined),
        });
        const data = await response.json();
        console.log(response.status, data);
        """
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/SnippetBuilderTests \
  2>&1 | tail -3
```

Expected: `Test run with 7 tests in 1 suite passed`

- [ ] **Step 5: SwiftLint**

```bash
swiftlint --strict 2>&1 | grep -v "^Done" | head -10
```

- [ ] **Step 6: 커밋**

```bash
git add SwaggerMan/Services/SnippetBuilder.swift \
  SwaggerManTests/Services/SnippetBuilderTests.swift
git commit -m "feat: SnippetBuilder — Swift/Python/JS 코드 스니펫 생성"
```

---

## Task 2: RequestEditorStore — lastRequest 저장

**Files:**
- Modify: `SwaggerMan/Stores/RequestEditorStore.swift`
- Modify: `SwaggerManTests/Integration/RequestEditorStoreAdditionalTests.swift`

- [ ] **Step 1: 실패 테스트 추가**

`SwaggerManTests/Integration/RequestEditorStoreAdditionalTests.swift`에 다음 테스트를 추가 (기존 `@Suite` 블록 안):

```swift
@Test("send — lastRequest가 실행된 요청으로 설정됨")
func sendSetsLastRequest() async throws {
    let container = try ModelContainerFactory.makeInMemory()
    let ctx = container.mainContext
    let projectStore = ProjectStore(modelContext: ctx)
    try projectStore.addProject(alias: "Test", swaggerURL: "https://api.test")
    let project = projectStore.projects[0]
    let mockClient = MockHTTPClient()
    let store = RequestEditorStore(httpClient: mockClient)
    let historyStore = HistoryStore(modelContext: ctx)

    let op = makeOp(method: .post, path: "/users")
    store.loadOperation(op, baseURL: "https://api.test", environment: makeEnv())

    await store.send(project: project, historyStore: historyStore, disableTLS: false)

    #expect(store.lastRequest != nil)
    #expect(store.lastRequest?.method == .post)
}

@Test("loadOperation — lastRequest가 nil로 초기화됨")
func loadOperationClearsLastRequest() async throws {
    let mockClient = MockHTTPClient()
    let store = RequestEditorStore(httpClient: mockClient)
    let container = try ModelContainerFactory.makeInMemory()
    let ctx = container.mainContext
    let projectStore = ProjectStore(modelContext: ctx)
    try projectStore.addProject(alias: "Test", swaggerURL: "https://api.test")
    let project = projectStore.projects[0]
    let historyStore = HistoryStore(modelContext: ctx)

    let op = makeOp(method: .get, path: "/users")
    store.loadOperation(op, baseURL: "https://api.test", environment: makeEnv())
    await store.send(project: project, historyStore: historyStore, disableTLS: false)
    #expect(store.lastRequest != nil)

    store.loadOperation(makeOp(method: .post, path: "/items"), baseURL: "https://api.test", environment: makeEnv())
    #expect(store.lastRequest == nil)
}
```

- [ ] **Step 2: 빌드 실패 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" \
  -only-testing "SwaggerManTests/RequestEditorStoreAdditionalTests/sendSetsLastRequest" \
  2>&1 | grep -E "error:|cannot find" | head -5
```

Expected: `error: value of type 'RequestEditorStore' has no member 'lastRequest'`

- [ ] **Step 3: RequestEditorStore에 lastRequest 추가**

`SwaggerMan/Stores/RequestEditorStore.swift`를 읽은 뒤:

1. `lastCurlString` 선언 바로 아래에 추가:
```swift
private(set) var lastRequest: HTTPRequest?
```

2. `loadOperation` 메서드 내 `lastCurlString = nil` 바로 아래에 추가:
```swift
lastRequest = nil
```

3. `clearSelection` 메서드 내 `lastCurlString = nil` 바로 아래에 추가:
```swift
lastRequest = nil
```

4. `send` 메서드 내 `lastCurlString = CurlBuilder.build(request)` 바로 아래에 추가:
```swift
lastRequest = request
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" \
  -only-testing "SwaggerManTests/RequestEditorStoreAdditionalTests" \
  2>&1 | tail -3
```

Expected: 전체 Additional Tests 통과.

- [ ] **Step 5: SwiftLint + 커밋**

```bash
swiftlint --strict 2>&1 | grep -v "^Done" | head -5
git add SwaggerMan/Stores/RequestEditorStore.swift \
  SwaggerManTests/Integration/RequestEditorStoreAdditionalTests.swift
git commit -m "feat: RequestEditorStore — lastRequest 저장으로 코드 스니펫 지원"
```

---

## Task 3: ResponsePaneView — 코드 스니펫 버튼

**Files:**
- Modify: `SwaggerMan/Views/Response/ResponsePaneView.swift`

현재 `ResponseDetailView(response:curlString:)`에 `lastRequest: HTTPRequest?` 파라미터를 추가하고, cURL 버튼 옆에 언어 선택 `Menu`를 붙인다.

- [ ] **Step 1: ResponseDetailView 시그니처 확장**

`ResponsePaneView.swift`에서 `struct ResponseDetailView: View` 부분을 찾아 `lastRequest` 파라미터 추가:

```swift
struct ResponseDetailView: View {
    let response: HTTPResponse
    let curlString: String?
    let lastRequest: HTTPRequest?   // ← 추가
```

- [ ] **Step 2: ResponsePaneView의 ResponseDetailView 호출 업데이트**

`ResponsePaneView.body` 내 `ResponseDetailView` 생성 부분:

```swift
ResponseDetailView(response: response, curlString: store.lastCurlString, lastRequest: store.lastRequest)
```

- [ ] **Step 3: 코드 스니펫 Menu 버튼 추가**

`ResponseDetailView.body`의 status bar HStack에서 기존 cURL 버튼 바로 뒤에 추가. 현재 cURL 버튼은 다음과 같다:

```swift
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
```

그 뒤에 추가:

```swift
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
    .menuStyle(.borderlessButton)
    .fixedSize()
    .buttonStyle(.bordered)
    .controlSize(.small)
    .help("코드 스니펫을 언어를 선택하여 클립보드에 복사합니다.")
}
```

- [ ] **Step 4: 테스트 파일의 ResponseDetailView 호출 업데이트**

```bash
grep -rn "ResponseDetailView(" SwaggerManTests/
```

찾은 각 호출에 `lastRequest: nil` 추가:

```swift
ResponseDetailView(response: response, curlString: nil, lastRequest: nil)
```

- [ ] **Step 5: 빌드 + 전체 테스트**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" 2>&1 | tail -5
```

- [ ] **Step 6: SwiftLint + 커밋**

```bash
swiftlint --strict 2>&1 | grep -v "^Done" | head -10
git add SwaggerMan/Views/Response/ResponsePaneView.swift
git commit -m "feat: 응답 패널 코드 스니펫 복사 버튼 추가 (Swift/Python/JS)"
```

---

## Task 4: ResponsePaneView — ⌘F 응답 검색

**Files:**
- Modify: `SwaggerMan/Views/Response/ResponsePaneView.swift`

`ResponseDetailView`에 로컬 `@State` 검색 상태 추가. `AttributedString`으로 매치를 노란색 배경 하이라이트. ⌘F로 검색 바 토글.

- [ ] **Step 1: @State 프로퍼티 추가**

`ResponseDetailView` struct 내 기존 `let` 프로퍼티들 아래에 추가:

```swift
@State private var searchText = ""
@State private var isSearchActive = false
```

- [ ] **Step 2: highlightedBody + matchCount 연산 프로퍼티 추가**

`ResponseDetailView`의 `var body` 앞에 추가:

```swift
private var highlightedBody: AttributedString {
    guard !searchText.isEmpty else { return AttributedString(prettyBody) }

    var result = AttributedString()
    var searchStart = prettyBody.startIndex

    while searchStart < prettyBody.endIndex,
          let found = prettyBody.range(
              of: searchText,
              options: .caseInsensitive,
              range: searchStart ..< prettyBody.endIndex
          )
    {
        // 매치 전 prefix
        let prefix = String(prettyBody[searchStart ..< found.lowerBound])
        if !prefix.isEmpty { result += AttributedString(prefix) }

        // 하이라이트된 매치
        var highlight = AttributedString(String(prettyBody[found]))
        highlight.backgroundColor = Color.yellow
        highlight.foregroundColor = Color.black
        result += highlight

        searchStart = found.upperBound
    }

    // 나머지 suffix
    if searchStart < prettyBody.endIndex {
        result += AttributedString(String(prettyBody[searchStart...]))
    }

    return result
}

private var matchCount: Int {
    guard !searchText.isEmpty else { return 0 }
    var count = 0
    var searchStart = prettyBody.startIndex
    while searchStart < prettyBody.endIndex,
          let found = prettyBody.range(
              of: searchText,
              options: .caseInsensitive,
              range: searchStart ..< prettyBody.endIndex
          )
    {
        count += 1
        searchStart = found.upperBound
    }
    return count
}
```

- [ ] **Step 3: 검색 바 UI 추가**

`ResponseDetailView.body`의 `VStack(spacing: 0)` 내부, `Divider()` 바로 아래 (`// Response Headers` 섹션 위)에 추가:

```swift
// Search bar (visible when isSearchActive)
if isSearchActive {
    HStack(spacing: 8) {
        Image(systemName: "magnifyingglass")
            .font(.caption)
            .foregroundStyle(.secondary)
        TextField("검색...", text: $searchText)
            .textFieldStyle(.plain)
            .font(.system(.caption))
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
```

- [ ] **Step 4: Text(prettyBody) → Text(highlightedBody) 교체**

기존:
```swift
Text(prettyBody)
    .font(.system(.caption, design: .monospaced))
    .frame(maxWidth: .infinity, alignment: .leading)
    .textSelection(.enabled)
    .padding(12)
```

교체:
```swift
Text(highlightedBody)
    .font(.system(.caption, design: .monospaced))
    .frame(maxWidth: .infinity, alignment: .leading)
    .textSelection(.enabled)
    .padding(12)
```

- [ ] **Step 5: ⌘F 키보드 단축키 추가**

`ResponseDetailView.body`의 최외곽 `VStack`에 `.overlay` modifier 추가:

```swift
.overlay(
    Button("") {
        isSearchActive.toggle()
        if !isSearchActive { searchText = "" }
    }
    .keyboardShortcut("f", modifiers: .command)
    .opacity(0)
    .allowsHitTesting(false)
)
```

또한 Escape 키로 검색 닫기를 위해 searchBar의 Button에 이미 있는 `.keyboardShortcut(.escape, modifiers: [])` 없이도 TextField가 포커스를 잃으면 닫히도록, 이미 xmark 버튼이 있으므로 충분.

- [ ] **Step 6: 전체 테스트 + SwiftLint**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" 2>&1 | tail -5
swiftlint --strict 2>&1 | grep -v "^Done" | head -10
```

- [ ] **Step 7: 커밋**

```bash
git add SwaggerMan/Views/Response/ResponsePaneView.swift
git commit -m "feat: 응답 패널 ⌘F 검색 + 키워드 하이라이트"
```

---

## 완료 기준

- [ ] 전체 테스트 통과 (기존 336개 + 신규 테스트)
- [ ] SwiftLint 0 violations
- [ ] 앱 실행 확인:
  - [ ] 응답 수신 후 `Code` 메뉴 버튼 표시됨
  - [ ] Swift/Python/JS 선택 시 해당 코드 클립보드 복사됨
  - [ ] ⌘F로 검색 바 나타남 / xmark로 닫힘
  - [ ] 검색어 입력 시 응답 본문에서 노란색 하이라이트
  - [ ] 일치 개수 표시됨
