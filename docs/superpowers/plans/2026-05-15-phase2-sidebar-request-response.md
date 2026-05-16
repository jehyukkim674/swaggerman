# Phase 2: Sidebar + RequestPane + Send/Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a working end-to-end flow — sidebar operation list with search/filter, JSON-mode request editor with Send, and response viewer — on top of the Phase 1 foundation.

**Architecture:** `OperationStore` gains `SpecCache` injection so in-session project switches skip re-fetching. A new `RequestEditorStore` owns all request/response state (params, headers, body, response). `HistoryStore` persists executed requests to SwiftData with a 500-item-per-project cap. Three new view subtrees (Sidebar, Request, Response) replace the Phase 1 placeholder `Text("…")` views in `RootView`.

**Tech Stack:** Swift 5.9+, SwiftUI, SwiftData, `@Observable @MainActor`, Swift Testing (`@Test`, `#expect`), `MockURLProtocol`, xcodegen 2.45.4

---

## File Map

**New files (create):**
- `SwaggerMan/Services/CurlBuilder.swift` — static `build(_:options:)` for cURL string generation
- `SwaggerMan/Stores/HistoryStore.swift` — append / clear / 500-item limit
- `SwaggerMan/Stores/RequestEditorStore.swift` — `RequestParam` struct + all request/response state
- `SwaggerMan/Views/Sidebar/SidebarView.swift` — operation list, search bar, method filter pills
- `SwaggerMan/Views/Request/RequestPaneView.swift` — operation header + TabView shell
- `SwaggerMan/Views/Request/ParamsTab.swift` — path + query params form
- `SwaggerMan/Views/Request/HeadersTab.swift` — editable key-value headers list
- `SwaggerMan/Views/Request/BodyTab.swift` — raw JSON TextEditor
- `SwaggerMan/Views/Request/AuthTab.swift` — read-only auth scheme display
- `SwaggerMan/Views/Response/ResponsePaneView.swift` — status bar, body/headers tabs, cURL copy
- `SwaggerManTests/Services/CurlBuilderTests.swift`
- `SwaggerManTests/Integration/HistoryStoreTests.swift`
- `SwaggerManTests/Integration/RequestEditorStoreTests.swift`

**Modified files:**
- `SwaggerMan/Stores/OperationStore.swift` — inject `SpecCacheProtocol`
- `SwaggerMan/Views/Root/RootView.swift` — add new stores, wire views, `onChange` → load spec
- `SwaggerMan/Views/Root/TopBar.swift` — add `onEnvironmentEditor` callback + menu item
- `SwaggerManTests/TestHelpers/MockServices.swift` — add `MockSpecCache`, `MockHTTPClient`
- `SwaggerManTests/Integration/OperationStoreTests.swift` — add cache-hit test

---

## Task 1: Wire SpecCache into OperationStore

**Files:**
- Modify: `SwaggerMan/Stores/OperationStore.swift`
- Modify: `SwaggerManTests/TestHelpers/MockServices.swift`
- Modify: `SwaggerManTests/Integration/OperationStoreTests.swift`

- [ ] **Step 1: Write the failing cache-hit test**

Add to `SwaggerManTests/Integration/OperationStoreTests.swift`:

```swift
func makeStore(parser: OpenAPIParserProtocol = MockOpenAPIParser(),
               cache: SpecCacheProtocol? = nil) throws -> (OperationStore, ProjectStore, _container: ModelContainer) {
    let container = try ModelContainerFactory.makeInMemory()
    let ctx = container.mainContext
    let projectStore = ProjectStore(modelContext: ctx)
    let http = HTTPClient(session: .mock())
    let resolvedCache = cache ?? SpecCache(cacheDirectory: URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString))
    let opStore = OperationStore(parser: parser, httpClient: http, cache: resolvedCache)
    return (opStore, projectStore, container)
}

@Test("캐시 히트 시 네트워크 미호출")
func cacheHitSkipsNetwork() async throws {
    let mockCache = MockSpecCache()
    let (opStore, projectStore, _container) = try makeStore(cache: mockCache)
    _ = _container

    MockURLProtocol.requestHandler = { req in
        let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        return (res, "{}".data(using: .utf8)!)
    }
    defer { MockURLProtocol.requestHandler = nil }

    try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
    let project = projectStore.projects[0]

    // First load: populates memory cache
    try await opStore.loadSpec(for: project)
    #expect(opStore.currentSpec?.info.title == "Mock")

    // Second load after clearSpec: handler nil → must serve from cache
    opStore.clearSpec()
    MockURLProtocol.requestHandler = nil
    try await opStore.loadSpec(for: project)
    #expect(opStore.currentSpec?.info.title == "Mock")
}
```

Also update the existing `makeStore` calls in that file to use the new signature (it now has a default `cache:` parameter so existing calls compile unchanged).

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/OperationStoreTests/cacheHitSkipsNetwork 2>&1 | grep -E "(FAIL|error:|Build)"
```

Expected: build error "incorrect argument label in call" or similar — `OperationStore.init` doesn't have `cache:` yet.

- [ ] **Step 3: Add MockSpecCache to MockServices.swift**

Append to `SwaggerManTests/TestHelpers/MockServices.swift`:

```swift
final class MockSpecCache: SpecCacheProtocol, @unchecked Sendable {
    var storedEntries: [String: CachedEntry] = [:]

    func load(for urlString: String) async -> CachedEntry? {
        storedEntries[urlString]
    }

    func store(_ entry: CachedEntry, for urlString: String) async {
        storedEntries[urlString] = entry
    }

    func invalidate(for urlString: String) async {
        storedEntries.removeValue(forKey: urlString)
    }

    func clear() async {
        storedEntries.removeAll()
    }
}
```

- [ ] **Step 4: Update OperationStore to inject and use cache**

Replace `SwaggerMan/Stores/OperationStore.swift` with:

```swift
import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "OperationStore")

@Observable
@MainActor
final class OperationStore {
    private(set) var currentSpec: ParsedSpec?
    private(set) var isLoading = false
    private(set) var loadError: Error?

    var searchText: String = ""
    var selectedMethods: Set<HTTPMethod> = []

    var operations: [ParsedOperation] { currentSpec?.operations ?? [] }

    var filteredOperations: [ParsedOperation] {
        operations.filter { op in
            let matchesMethod = selectedMethods.isEmpty || selectedMethods.contains(op.method)
            let matchesSearch = searchText.isEmpty
                || op.path.localizedCaseInsensitiveContains(searchText)
                || (op.summary ?? "").localizedCaseInsensitiveContains(searchText)
                || op.tags.contains { $0.localizedCaseInsensitiveContains(searchText) }
            return matchesMethod && matchesSearch
        }
    }

    var operationsByTag: [(tag: String, operations: [ParsedOperation])] {
        var tagMap: [String: [ParsedOperation]] = [:]
        for op in filteredOperations {
            let tag = op.tags.first ?? "Other"
            tagMap[tag, default: []].append(op)
        }
        return tagMap.sorted { $0.key < $1.key }.map { (tag: $0.key, operations: $0.value) }
    }

    private let parser: OpenAPIParserProtocol
    private let httpClient: HTTPClientProtocol
    private let cache: SpecCacheProtocol

    init(
        parser: OpenAPIParserProtocol = OpenAPIParser(),
        httpClient: HTTPClientProtocol = HTTPClient(),
        cache: SpecCacheProtocol = SpecCache()
    ) {
        self.parser = parser
        self.httpClient = httpClient
        self.cache = cache
    }

    func loadSpec(for project: Project) async throws {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        guard let url = URL(string: project.swaggerURL) else {
            let err = SwaggerManError.parsing(.invalidJSON("Invalid URL: \(project.swaggerURL)"))
            loadError = err
            throw err
        }

        // Memory cache hit (disk cache returns empty operations — skip it)
        if let cached = await cache.load(for: project.swaggerURL),
           !cached.spec.operations.isEmpty {
            currentSpec = cached.spec
            log.info("Spec served from cache: \(cached.spec.info.title)")
            return
        }

        do {
            let response = try await httpClient.get(url, headers: [:])
            let spec = try parser.parse(response.body)
            await cache.store(CachedEntry(spec: spec, etag: nil, cachedAt: Date()),
                              for: project.swaggerURL)
            currentSpec = spec
            log.info("Spec loaded: \(spec.info.title) (\(spec.rawOperationCount) ops)")
        } catch {
            loadError = error
            throw error
        }
    }

    func clearSpec() {
        currentSpec = nil
        searchText = ""
        selectedMethods = []
        loadError = nil
    }
}
```

- [ ] **Step 5: Run all tests to verify green**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(PASS|FAIL|error:|Build succeeded|Build FAILED)"
```

Expected: `BUILD SUCCEEDED` and all tests pass.

- [ ] **Step 6: Commit**

```bash
git add SwaggerMan/Stores/OperationStore.swift \
        SwaggerManTests/TestHelpers/MockServices.swift \
        SwaggerManTests/Integration/OperationStoreTests.swift
git commit -m "feat: OperationStore에 SpecCache 주입 — 인메모리 캐시 히트 시 네트워크 재요청 없음"
```

---

## Task 2: CurlBuilder Service

**Files:**
- Create: `SwaggerMan/Services/CurlBuilder.swift`
- Create: `SwaggerManTests/Services/CurlBuilderTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `SwaggerManTests/Services/CurlBuilderTests.swift`:

```swift
import Testing
import Foundation
@testable import SwaggerMan

@Suite("CurlBuilder Tests")
struct CurlBuilderTests {

    @Test("GET 요청 — 플래그 없음")
    func buildGet() {
        let url = URL(string: "https://api.example.com/users")!
        let request = HTTPRequest(method: .get, url: url, headers: [:])
        let curl = CurlBuilder.build(request)
        #expect(curl == "curl \\\n  https://api.example.com/users")
    }

    @Test("POST JSON 요청 — -X, -H, -d 포함")
    func buildPost() {
        let url = URL(string: "https://api.example.com/users")!
        let body = "{\"name\":\"John\"}".data(using: .utf8)!
        let request = HTTPRequest(method: .post, url: url,
                                  headers: ["Content-Type": "application/json"], body: body)
        let curl = CurlBuilder.build(request)
        #expect(curl.contains("-X POST"))
        #expect(curl.contains("-H \"Content-Type: application/json\""))
        #expect(curl.contains("-d '{\"name\":\"John\"}'"))
        #expect(curl.contains("https://api.example.com/users"))
    }

    @Test("Authorization 헤더 마스킹 — Bearer ***")
    func masksAuthWhenEnabled() {
        let url = URL(string: "https://api.example.com/me")!
        let request = HTTPRequest(method: .get, url: url,
                                  headers: ["Authorization": "Bearer secret-token-abc"])
        let masked = CurlBuilder.build(request, options: .init(maskAuthorization: true))
        #expect(masked.contains("Bearer ***"))
        #expect(!masked.contains("secret-token-abc"))
    }

    @Test("Authorization 헤더 마스킹 비활성화 — 실제 값 포함")
    func noMaskingWhenDisabled() {
        let url = URL(string: "https://api.example.com/me")!
        let request = HTTPRequest(method: .get, url: url,
                                  headers: ["Authorization": "Bearer secret-token-abc"])
        let unmasked = CurlBuilder.build(request, options: .init(maskAuthorization: false))
        #expect(unmasked.contains("Bearer secret-token-abc"))
    }

    @Test("insecure 옵션 — -k 플래그 포함")
    func insecureFlag() {
        let url = URL(string: "https://dev.internal/api")!
        let request = HTTPRequest(method: .get, url: url, headers: [:])
        let curl = CurlBuilder.build(request, options: .init(insecure: true))
        #expect(curl.contains("-k"))
    }

    @Test("헤더 알파벳순 정렬")
    func sortedHeaders() {
        let url = URL(string: "https://api.example.com/data")!
        let request = HTTPRequest(method: .get, url: url,
                                  headers: ["X-Custom": "val", "Accept": "application/json"])
        let curl = CurlBuilder.build(request)
        let acceptIdx = curl.range(of: "Accept")!.lowerBound
        let customIdx = curl.range(of: "X-Custom")!.lowerBound
        #expect(acceptIdx < customIdx)
    }
}
```

- [ ] **Step 2: Run test to confirm build failure**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/CurlBuilderTests 2>&1 | grep -E "(error:|FAIL|Build)"
```

Expected: build error — `CurlBuilder` type not found.

- [ ] **Step 3: Implement CurlBuilder**

Create `SwaggerMan/Services/CurlBuilder.swift`:

```swift
import Foundation

struct CurlBuilder {
    struct Options {
        var maskAuthorization: Bool = true
        var insecure: Bool = false
    }

    static func build(_ request: HTTPRequest, options: Options = .init()) -> String {
        var parts = ["curl"]

        if request.method != .get {
            parts += ["-X", request.method.rawValue]
        }

        for (key, value) in request.headers.sorted(by: { $0.key < $1.key }) {
            let displayValue: String
            if options.maskAuthorization, key.lowercased() == "authorization" {
                displayValue = maskAuthValue(value)
            } else {
                displayValue = value
            }
            parts += ["-H", "\"\(key): \(displayValue)\""]
        }

        if let body = request.body, let bodyStr = String(data: body, encoding: .utf8) {
            let escaped = bodyStr.replacingOccurrences(of: "'", with: "'\\''")
            parts += ["-d", "'\(escaped)'"]
        }

        if options.insecure { parts.append("-k") }

        parts.append(request.url.absoluteString)

        return parts.joined(separator: " \\\n  ")
    }

    private static func maskAuthValue(_ value: String) -> String {
        let split = value.split(separator: " ", maxSplits: 1)
        if split.count == 2 { return "\(split[0]) ***" }
        return "***"
    }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/CurlBuilderTests 2>&1 | grep -E "(PASS|FAIL|Build)"
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run xcodegen to register new files**

```bash
xcodegen generate
```

Expected: `✅ Generated: SwaggerMan.xcodeproj` with no errors.

- [ ] **Step 6: Commit**

```bash
git add SwaggerMan/Services/CurlBuilder.swift \
        SwaggerManTests/Services/CurlBuilderTests.swift \
        SwaggerMan.xcodeproj
git commit -m "feat: CurlBuilder 서비스 구현 — Authorization 마스킹, insecure 옵션, 헤더 알파벳 정렬"
```

---

## Task 3: HistoryStore

**Files:**
- Create: `SwaggerMan/Stores/HistoryStore.swift`
- Create: `SwaggerManTests/Integration/HistoryStoreTests.swift`

- [ ] **Step 1: Write failing tests**

Create `SwaggerManTests/Integration/HistoryStoreTests.swift`:

```swift
import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("HistoryStore Tests", .serialized)
@MainActor
struct HistoryStoreTests {

    func makeSetup() throws -> (HistoryStore, Project, _container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)
        return (historyStore, project, container)
    }

    func makeItem(durationMs: Int = 100) -> HistoryItem {
        HistoryItem(
            environmentID: UUID(),
            method: "GET",
            path: "/status",
            fullURL: "https://api.com/status",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "ok",
            responseSize: 2,
            durationMs: durationMs
        )
    }

    @Test("항목 추가 시 project.history에 반영")
    func appendsItem() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        store.append(makeItem(), to: project)
        #expect(project.history.count == 1)
        #expect(store.items.count == 1)
    }

    @Test("500개 초과 시 가장 오래된 항목 삭제")
    func enforcesLimit() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        for i in 0..<501 {
            store.append(makeItem(durationMs: i), to: project)
        }
        #expect(project.history.count == 500)
        #expect(store.items.count == 500)
    }

    @Test("clear 시 모든 항목 제거")
    func clearsHistory() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        store.append(makeItem(), to: project)
        store.append(makeItem(), to: project)
        store.clear(for: project)
        #expect(project.history.isEmpty)
        #expect(store.items.isEmpty)
    }

    @Test("loadHistory — executedAt 내림차순 정렬")
    func loadsSortedDescending() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        let item1 = makeItem(durationMs: 10)
        let item2 = makeItem(durationMs: 20)
        store.append(item1, to: project)
        store.append(item2, to: project)
        store.loadHistory(for: project)
        // Most recent first — item2 was inserted last so executedAt is later
        #expect(store.items.first?.durationMs == 20)
    }
}
```

- [ ] **Step 2: Run test to confirm failure**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/HistoryStoreTests 2>&1 | grep -E "(error:|FAIL|Build)"
```

Expected: build error — `HistoryStore` not found.

- [ ] **Step 3: Implement HistoryStore**

Create `SwaggerMan/Stores/HistoryStore.swift`:

```swift
import SwiftData
import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "HistoryStore")

@Observable
@MainActor
final class HistoryStore {
    private(set) var items: [HistoryItem] = []
    private let modelContext: ModelContext
    private let maxItemsPerProject = 500

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func loadHistory(for project: Project) {
        items = project.history.sorted { $0.executedAt > $1.executedAt }
    }

    func append(_ item: HistoryItem, to project: Project) {
        item.project = project
        modelContext.insert(item)
        project.history.append(item)

        let sorted = project.history.sorted { $0.executedAt < $1.executedAt }
        if sorted.count > maxItemsPerProject {
            let excess = sorted.prefix(sorted.count - maxItemsPerProject)
            for old in excess {
                project.history.removeAll { $0.id == old.id }
                modelContext.delete(old)
            }
        }

        try? modelContext.save()
        loadHistory(for: project)
        log.debug("History appended — total: \(project.history.count)")
    }

    func clear(for project: Project) {
        for item in project.history { modelContext.delete(item) }
        project.history.removeAll()
        try? modelContext.save()
        items = []
    }
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/HistoryStoreTests 2>&1 | grep -E "(PASS|FAIL|Build)"
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run xcodegen**

```bash
xcodegen generate
```

- [ ] **Step 6: Commit**

```bash
git add SwaggerMan/Stores/HistoryStore.swift \
        SwaggerManTests/Integration/HistoryStoreTests.swift \
        SwaggerMan.xcodeproj
git commit -m "feat: HistoryStore 구현 — 500개 한도 자동 정리, executedAt 내림차순 정렬"
```

---

## Task 4: RequestEditorStore

**Files:**
- Create: `SwaggerMan/Stores/RequestEditorStore.swift`
- Create: `SwaggerManTests/Integration/RequestEditorStoreTests.swift`
- Modify: `SwaggerManTests/TestHelpers/MockServices.swift` — add `MockHTTPClient`

- [ ] **Step 1: Add MockHTTPClient to MockServices.swift**

Append to `SwaggerManTests/TestHelpers/MockServices.swift`:

```swift
final class MockHTTPClient: HTTPClientProtocol, @unchecked Sendable {
    var getResult: Result<HTTPResponse, Error> = .success(
        HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 0)
    )
    var executeResult: Result<HTTPResponse, Error> = .success(
        HTTPResponse(statusCode: 200, headers: [:], body: "{}".data(using: .utf8)!, durationMs: 42)
    )

    func get(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
        try getResult.get()
    }

    func execute(_ request: HTTPRequest) async throws -> HTTPResponse {
        try executeResult.get()
    }
}
```

- [ ] **Step 2: Write failing tests**

Create `SwaggerManTests/Integration/RequestEditorStoreTests.swift`:

```swift
import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("RequestEditorStore Tests", .serialized)
@MainActor
struct RequestEditorStoreTests {

    func makeOperation(method: HTTPMethod = .get, path: String = "/users/{id}",
                       hasBody: Bool = false) -> ParsedOperation {
        ParsedOperation(
            id: "\(method.rawValue) \(path)",
            method: method,
            path: path,
            operationId: nil,
            summary: nil,
            description: nil,
            tags: ["Users"],
            parameters: [
                ParsedParameter(id: "path-id-path", name: "id", location: .path,
                                required: true, schema: nil, description: nil),
                ParsedParameter(id: "path-limit-query", name: "limit", location: .query,
                                required: false, schema: nil, description: nil)
            ],
            requestBody: hasBody
                ? ParsedRequestBody(required: true, contentType: "application/json", schema: nil)
                : nil,
            responseDescriptions: ["200": "Success"]
        )
    }

    @Test("loadOperation이 pathParams / queryParams 초기화")
    func loadOperationSetsParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())

        #expect(store.selectedOperation?.id == "GET /users/{id}")
        #expect(store.pathParams["id"] == "")
        #expect(store.queryParams.count == 1)
        #expect(store.queryParams[0].key == "limit")
    }

    @Test("loadOperation이 이전 응답 초기화")
    func loadOperationClearsResponse() {
        let mockHTTP = MockHTTPClient()
        let store = RequestEditorStore(httpClient: mockHTTP)
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        // Simulate a previous response by loading again (no real response yet, just verify nil)
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        #expect(store.response == nil)
        #expect(store.sendError == nil)
    }

    @Test("hasBody일 때 bodyJSON 초기값 '{}'")
    func loadOperationWithBodySetsJSON() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(method: .post, path: "/users", hasBody: true)
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        #expect(store.bodyJSON == "{}")
    }

    @Test("send 성공 — response 업데이트 및 HistoryItem 생성")
    func sendSuccessCreatesHistoryItem() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        mockHTTP.executeResult = .success(
            HTTPResponse(statusCode: 201, headers: ["Content-Type": "application/json"],
                         body: "{\"id\":1}".data(using: .utf8)!, durationMs: 55)
        )

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation(method: .post, path: "/users", hasBody: true)
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        store.bodyJSON = "{\"name\":\"Alice\"}"

        await store.send(project: project, historyStore: historyStore)

        #expect(store.response?.statusCode == 201)
        #expect(store.sendError == nil)
        #expect(project.history.count == 1)
        #expect(project.history[0].method == "POST")
        #expect(project.history[0].responseStatus == 201)
    }

    @Test("send 실패 — sendError 설정")
    func sendFailureSetsError() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        mockHTTP.executeResult = .failure(SwaggerManError.network(.timeout))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())

        await store.send(project: project, historyStore: historyStore)

        #expect(store.sendError != nil)
        #expect(store.response == nil)
        #expect(project.history.isEmpty)
    }

    @Test("buildRequest — path param 치환")
    func buildRequestSubstitutesPathParam() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        var capturedURL: URL?
        mockHTTP.executeResult = .success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 10)
        )

        // Subclass to capture URL — instead, verify via history
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        store.pathParams["id"] = "42"

        await store.send(project: project, historyStore: historyStore)

        #expect(project.history.first?.fullURL.contains("/users/42") == true)
    }
}
```

- [ ] **Step 3: Run test to confirm failure**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/RequestEditorStoreTests 2>&1 | grep -E "(error:|FAIL|Build)"
```

Expected: build error — `RequestEditorStore` not found.

- [ ] **Step 4: Implement RequestEditorStore**

Create `SwaggerMan/Stores/RequestEditorStore.swift`:

```swift
import SwiftUI
import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "RequestEditorStore")

struct RequestParam: Identifiable {
    var id = UUID()
    var key: String
    var value: String
    var enabled: Bool = true
}

@Observable
@MainActor
final class RequestEditorStore {
    private(set) var selectedOperation: ParsedOperation?
    private(set) var currentBaseURL: String = ""
    private(set) var currentEnvID: UUID = UUID()

    var pathParams: [String: String] = [:]
    var queryParams: [RequestParam] = []
    var requestHeaders: [RequestParam] = []
    var bodyJSON: String = ""

    private(set) var isSending = false
    private(set) var response: HTTPResponse?
    private(set) var sendError: Error?
    private(set) var lastCurlString: String?

    private let httpClient: HTTPClientProtocol

    init(httpClient: HTTPClientProtocol = HTTPClient()) {
        self.httpClient = httpClient
    }

    func loadOperation(_ op: ParsedOperation, baseURL: String, envID: UUID) {
        selectedOperation = op
        currentBaseURL = baseURL
        currentEnvID = envID
        response = nil
        sendError = nil
        lastCurlString = nil

        pathParams = Dictionary(uniqueKeysWithValues:
            op.parameters.filter { $0.location == .path }.map { ($0.name, "") }
        )
        queryParams = op.parameters
            .filter { $0.location == .query }
            .map { RequestParam(key: $0.name, value: "", enabled: true) }
        requestHeaders = []
        bodyJSON = op.requestBody != nil ? "{}" : ""
    }

    func clearSelection() {
        selectedOperation = nil
        pathParams = [:]
        queryParams = []
        requestHeaders = []
        bodyJSON = ""
        response = nil
        sendError = nil
        lastCurlString = nil
    }

    func send(project: Project, historyStore: HistoryStore) async {
        guard let op = selectedOperation else { return }
        isSending = true
        sendError = nil
        defer { isSending = false }

        do {
            let request = try buildRequest(op: op)
            lastCurlString = CurlBuilder.build(request)
            response = try await httpClient.execute(request)

            let reqHeadersJSON = jsonString(from: request.headers)
            let resHeadersJSON = jsonString(from: response!.headers)
            let bodyStr = response!.bodyString ?? ""
            let truncatedBody = bodyStr.count > 1_000_000
                ? String(bodyStr.prefix(1_000_000)) + "\n...(truncated)"
                : bodyStr

            let item = HistoryItem(
                environmentID: currentEnvID,
                method: op.method.rawValue,
                path: op.path,
                fullURL: request.url.absoluteString,
                requestHeadersJSON: reqHeadersJSON,
                requestBody: request.body.flatMap { String(data: $0, encoding: .utf8) },
                responseStatus: response!.statusCode,
                responseHeadersJSON: resHeadersJSON,
                responseBody: truncatedBody,
                responseSize: response!.body.count,
                durationMs: response!.durationMs,
                project: project
            )
            historyStore.append(item, to: project)
            log.info("Request sent: \(op.method.rawValue) \(op.path) → \(self.response!.statusCode)")
        } catch {
            sendError = error
            log.error("Request failed: \(error.localizedDescription)")
        }
    }

    private func buildRequest(op: ParsedOperation) throws -> HTTPRequest {
        var path = op.path
        for (key, value) in pathParams {
            let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
            path = path.replacingOccurrences(of: "{\(key)}", with: encoded)
        }

        guard var components = URLComponents(string: currentBaseURL + path) else {
            throw SwaggerManError.validation(.requiredFieldMissing("URL"))
        }

        let enabledQuery = queryParams.filter { $0.enabled && !$0.value.isEmpty }
        if !enabledQuery.isEmpty {
            components.queryItems = enabledQuery.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        guard let url = components.url else {
            throw SwaggerManError.validation(.requiredFieldMissing("URL"))
        }

        var headers: [String: String] = [:]
        for h in requestHeaders where h.enabled && !h.key.isEmpty {
            headers[h.key] = h.value
        }

        var body: Data?
        let trimmedBody = bodyJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedBody.isEmpty {
            body = trimmedBody.data(using: .utf8)
            if headers["Content-Type"] == nil && op.requestBody != nil {
                headers["Content-Type"] = "application/json"
            }
        }

        return HTTPRequest(method: op.method, url: url, headers: headers, body: body)
    }

    private func jsonString(from dict: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: .sortedKeys),
              let str = String(data: data, encoding: .utf8) else { return "{}" }
        return str
    }
}
```

- [ ] **Step 5: Run tests — expect pass**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' -only-testing:SwaggerManTests/RequestEditorStoreTests 2>&1 | grep -E "(PASS|FAIL|Build)"
```

Expected: all 5 tests pass.

- [ ] **Step 6: Run xcodegen**

```bash
xcodegen generate
```

- [ ] **Step 7: Run all tests to ensure nothing broke**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(PASS|FAIL|Build succeeded|Build FAILED)"
```

- [ ] **Step 8: Commit**

```bash
git add SwaggerMan/Stores/RequestEditorStore.swift \
        SwaggerManTests/Integration/RequestEditorStoreTests.swift \
        SwaggerManTests/TestHelpers/MockServices.swift \
        SwaggerMan.xcodeproj
git commit -m "feat: RequestEditorStore 구현 — path/query params, bodyJSON, send → HistoryItem 생성"
```

---

## Task 5: SidebarView

**Files:**
- Create: `SwaggerMan/Views/Sidebar/SidebarView.swift`

No tests needed for views in Phase 2.

- [ ] **Step 1: Create SidebarView.swift**

Create `SwaggerMan/Views/Sidebar/SidebarView.swift`:

```swift
import SwiftUI

struct SidebarView: View {
    @Bindable var operationStore: OperationStore
    let onSelectOperation: (ParsedOperation) -> Void

    var body: some View {
        VStack(spacing: 0) {
            SearchBarView(text: $operationStore.searchText)

            MethodFilterView(selectedMethods: $operationStore.selectedMethods)

            Divider()

            Group {
                if operationStore.isLoading {
                    ProgressView("로딩 중...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = operationStore.loadError {
                    VStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.title2)
                            .foregroundStyle(.orange)
                        Text(err.localizedDescription)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if operationStore.operationsByTag.isEmpty {
                    ContentUnavailableView(
                        "API 없음",
                        systemImage: "doc.text.magnifyingglass",
                        description: Text("프로젝트를 선택하거나 검색어를 바꿔보세요.")
                    )
                } else {
                    List(operationStore.operationsByTag, id: \.tag) { group in
                        Section(group.tag) {
                            ForEach(group.operations) { op in
                                OperationRowView(operation: op)
                                    .contentShape(Rectangle())
                                    .onTapGesture { onSelectOperation(op) }
                            }
                        }
                    }
                    .listStyle(.sidebar)
                }
            }
        }
    }
}

// MARK: - Search Bar

private struct SearchBarView: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("검색...", text: $text)
                .textFieldStyle(.plain)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color(.textBackgroundColor).opacity(0.4))
        .cornerRadius(8)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }
}

// MARK: - Method Filter Pills

private struct MethodFilterView: View {
    @Binding var selectedMethods: Set<HTTPMethod>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(HTTPMethod.allCases, id: \.self) { method in
                    let selected = selectedMethods.contains(method)
                    Button(method.rawValue) {
                        if selected { selectedMethods.remove(method) }
                        else { selectedMethods.insert(method) }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                    .tint(methodColor(method))
                    .background(selected ? methodColor(method).opacity(0.15) : .clear)
                    .cornerRadius(4)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
    }

    private func methodColor(_ method: HTTPMethod) -> Color {
        switch method {
        case .get: return .green
        case .post: return .blue
        case .put: return .orange
        case .delete: return .red
        case .patch: return .purple
        case .options, .head: return .gray
        }
    }
}

// MARK: - Operation Row

struct OperationRowView: View {
    let operation: ParsedOperation

    var body: some View {
        HStack(spacing: 6) {
            Text(operation.method.rawValue)
                .font(.system(.caption, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .frame(width: 52, alignment: .leading)

            VStack(alignment: .leading, spacing: 1) {
                Text(operation.path)
                    .font(.system(.caption, design: .monospaced))
                    .lineLimit(1)
                if let summary = operation.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private var methodColor: Color {
        switch operation.method {
        case .get: return .green
        case .post: return .blue
        case .put: return .orange
        case .delete: return .red
        case .patch: return .purple
        case .options, .head: return .gray
        }
    }
}
```

- [ ] **Step 2: Run xcodegen and build**

```bash
xcodegen generate && xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(error:|Build succeeded|Build FAILED)"
```

Expected: `BUILD SUCCEEDED`.

- [ ] **Step 3: Commit**

```bash
git add SwaggerMan/Views/Sidebar/SidebarView.swift SwaggerMan.xcodeproj
git commit -m "feat: SidebarView 구현 — 태그 그룹, 검색, HTTP 메서드 필터 pills"
```

---

## Task 6: RequestPaneView + Tabs

**Files:**
- Create: `SwaggerMan/Views/Request/RequestPaneView.swift`
- Create: `SwaggerMan/Views/Request/ParamsTab.swift`
- Create: `SwaggerMan/Views/Request/HeadersTab.swift`
- Create: `SwaggerMan/Views/Request/BodyTab.swift`
- Create: `SwaggerMan/Views/Request/AuthTab.swift`

- [ ] **Step 1: Create RequestPaneView.swift**

Create `SwaggerMan/Views/Request/RequestPaneView.swift`:

```swift
import SwiftUI

struct RequestPaneView: View {
    @Bindable var store: RequestEditorStore
    let activeEnvironment: APIEnvironment?
    let onSend: () async -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let op = store.selectedOperation {
                OperationHeaderView(
                    operation: op,
                    isSending: store.isSending,
                    onSend: { Task { await onSend() } }
                )
                Divider()

                TabView {
                    ParamsTab(store: store)
                        .tabItem { Text("Params") }
                    HeadersTab(store: store)
                        .tabItem { Text("Headers") }
                    BodyTab(store: store, hasBody: op.requestBody != nil)
                        .tabItem { Text("Body") }
                    AuthTab(environment: activeEnvironment)
                        .tabItem { Text("Auth") }
                }
            } else {
                ContentUnavailableView(
                    "Endpoint 선택",
                    systemImage: "arrow.left.square",
                    description: Text("사이드바에서 endpoint를 선택하세요.")
                )
            }
        }
    }
}

// MARK: - Operation Header

private struct OperationHeaderView: View {
    let operation: ParsedOperation
    let isSending: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(operation.method.rawValue)
                .font(.system(.body, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(methodColor.opacity(0.12))
                .cornerRadius(4)

            Text(operation.path)
                .font(.system(.body, design: .monospaced))
                .lineLimit(1)
                .foregroundStyle(.primary)

            Spacer()

            Button {
                onSend()
            } label: {
                if isSending {
                    ProgressView()
                        .scaleEffect(0.7)
                        .frame(width: 40)
                } else {
                    Text("Send")
                        .frame(width: 40)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSending)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }

    private var methodColor: Color {
        switch operation.method {
        case .get: return .green
        case .post: return .blue
        case .put: return .orange
        case .delete: return .red
        case .patch: return .purple
        case .options, .head: return .gray
        }
    }
}
```

- [ ] **Step 2: Create ParamsTab.swift**

Create `SwaggerMan/Views/Request/ParamsTab.swift`:

```swift
import SwiftUI

struct ParamsTab: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        if store.pathParams.isEmpty && store.queryParams.isEmpty {
            ContentUnavailableView("파라미터 없음", systemImage: "slash.circle")
        } else {
            Form {
                if !store.pathParams.isEmpty {
                    Section("Path Parameters") {
                        ForEach(store.pathParams.keys.sorted(), id: \.self) { key in
                            HStack {
                                Text("{\(key)}")
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 130, alignment: .leading)
                                TextField("값 입력", text: Binding(
                                    get: { store.pathParams[key] ?? "" },
                                    set: { store.pathParams[key] = $0 }
                                ))
                            }
                        }
                    }
                }

                if !store.queryParams.isEmpty {
                    Section("Query Parameters") {
                        ForEach($store.queryParams) { $param in
                            HStack {
                                Toggle("", isOn: $param.enabled)
                                    .labelsHidden()
                                    .frame(width: 20)
                                Text(param.key)
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 110, alignment: .leading)
                                TextField("값 입력", text: $param.value)
                            }
                        }
                    }
                }
            }
            .formStyle(.grouped)
        }
    }
}
```

- [ ] **Step 3: Create HeadersTab.swift**

Create `SwaggerMan/Views/Request/HeadersTab.swift`:

```swift
import SwiftUI

struct HeadersTab: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(spacing: 0) {
            List {
                ForEach($store.requestHeaders) { $header in
                    HStack(spacing: 6) {
                        Toggle("", isOn: $header.enabled)
                            .labelsHidden()
                            .frame(width: 20)
                        TextField("Header 이름", text: $header.key)
                            .frame(maxWidth: .infinity)
                        TextField("값", text: $header.value)
                            .frame(maxWidth: .infinity)
                        Button {
                            store.requestHeaders.removeAll { $0.id == header.id }
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .listStyle(.plain)

            Divider()

            Button {
                store.requestHeaders.append(RequestParam(key: "", value: "", enabled: true))
            } label: {
                Label("헤더 추가", systemImage: "plus")
            }
            .padding(8)
        }
    }
}
```

- [ ] **Step 4: Create BodyTab.swift**

Create `SwaggerMan/Views/Request/BodyTab.swift`:

```swift
import SwiftUI

struct BodyTab: View {
    @Bindable var store: RequestEditorStore
    let hasBody: Bool

    var body: some View {
        if !hasBody {
            ContentUnavailableView(
                "요청 본문 없음",
                systemImage: "doc.slash",
                description: Text("이 endpoint는 요청 본문을 사용하지 않습니다.")
            )
        } else {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("JSON")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("포맷") { formatJSON() }
                        .controlSize(.small)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)

                Divider()

                TextEditor(text: $store.bodyJSON)
                    .font(.system(.body, design: .monospaced))
                    .padding(8)
            }
        }
    }

    private func formatJSON() {
        guard let data = store.bodyJSON.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8) else { return }
        store.bodyJSON = str
    }
}
```

- [ ] **Step 5: Create AuthTab.swift**

Create `SwaggerMan/Views/Request/AuthTab.swift`:

```swift
import SwiftUI

struct AuthTab: View {
    let environment: APIEnvironment?

    var body: some View {
        Form {
            Section {
                if let env = environment {
                    LabeledContent("인증 방식") {
                        Text(authLabel(env.authScheme))
                            .foregroundStyle(.secondary)
                    }
                    if env.authScheme != .none {
                        Text("토큰은 환경 설정에서 관리합니다.\nKeychain 통합은 Phase 4에서 구현됩니다.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("활성 환경이 없습니다. TopBar에서 환경을 선택하세요.")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
    }

    private func authLabel(_ scheme: AuthSchemeType) -> String {
        switch scheme {
        case .none: return "없음"
        case .bearer: return "Bearer Token"
        case .basic: return "Basic Auth"
        case .apiKey: return "API Key"
        }
    }
}
```

- [ ] **Step 6: Run xcodegen and build**

```bash
xcodegen generate && xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(error:|Build succeeded|Build FAILED)"
```

Expected: `BUILD SUCCEEDED`.

- [ ] **Step 7: Commit**

```bash
git add SwaggerMan/Views/Request/ SwaggerMan.xcodeproj
git commit -m "feat: RequestPaneView 구현 — OperationHeader, Params/Headers/Body/Auth 탭"
```

---

## Task 7: ResponsePaneView

**Files:**
- Create: `SwaggerMan/Views/Response/ResponsePaneView.swift`

- [ ] **Step 1: Create ResponsePaneView.swift**

Create `SwaggerMan/Views/Response/ResponsePaneView.swift`:

```swift
import SwiftUI
import AppKit

struct ResponsePaneView: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        Group {
            if store.isSending {
                ProgressView("요청 중...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = store.sendError {
                SendErrorView(error: err)
            } else if let response = store.response {
                ResponseDetailView(response: response, curlString: store.lastCurlString)
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

// MARK: - Error State

private struct SendErrorView: View {
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

private struct ResponseDetailView: View {
    let response: HTTPResponse
    let curlString: String?
    @State private var selectedTab = 0

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
                    .cornerRadius(4)

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
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            Picker("", selection: $selectedTab) {
                Text("Body").tag(0)
                Text("Headers").tag(1)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.vertical, 4)

            Divider()

            if selectedTab == 0 {
                ScrollView {
                    Text(prettyBody)
                        .font(.system(.caption, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                        .padding(12)
                }
            } else {
                List(response.headers.sorted(by: { $0.key < $1.key }), id: \.key) { key, value in
                    HStack(alignment: .top, spacing: 8) {
                        Text(key)
                            .font(.system(.caption, design: .monospaced).bold())
                            .frame(width: 200, alignment: .leading)
                        Text(value)
                            .font(.system(.caption, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
                .listStyle(.plain)
            }
        }
    }

    private var prettyBody: String {
        let rawStr = response.bodyString ?? ""
        guard let data = rawStr.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8) else {
            // Return raw string (truncated at 1MB display limit)
            return rawStr.count > 1_000_000
                ? String(rawStr.prefix(1_000_000)) + "\n...(truncated)"
                : rawStr
        }
        return str.count > 1_000_000
            ? String(str.prefix(1_000_000)) + "\n...(truncated)"
            : str
    }

    private var statusColor: Color {
        switch response.statusCode {
        case 200..<300: return .green
        case 300..<400: return .yellow
        case 400..<500: return .orange
        default: return .red
        }
    }

    private func formatSize(_ bytes: Int) -> String {
        if bytes < 1_024 { return "\(bytes) B" }
        if bytes < 1_024 * 1_024 { return "\(bytes / 1_024) KB" }
        return String(format: "%.1f MB", Double(bytes) / (1_024 * 1_024))
    }
}
```

- [ ] **Step 2: Run xcodegen and build**

```bash
xcodegen generate && xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(error:|Build succeeded|Build FAILED)"
```

Expected: `BUILD SUCCEEDED`.

- [ ] **Step 3: Commit**

```bash
git add SwaggerMan/Views/Response/ResponsePaneView.swift SwaggerMan.xcodeproj
git commit -m "feat: ResponsePaneView 구현 — status/timing, body/headers 탭, JSON pretty-print, cURL 복사"
```

---

## Task 8: Wire RootView + TopBar + EnvironmentEditor Access

**Files:**
- Modify: `SwaggerMan/Views/Root/RootView.swift`
- Modify: `SwaggerMan/Views/Root/TopBar.swift`

- [ ] **Step 1: Update TopBar to expose environment editor action**

Replace `SwaggerMan/Views/Root/TopBar.swift` with:

```swift
import SwiftUI

struct TopBar: View {
    @Bindable var projectStore: ProjectStore
    @Bindable var environmentStore: EnvironmentStore
    @Binding var showSidebar: Bool
    @Binding var showRequest: Bool
    @Binding var showResponse: Bool
    let onSettings: () -> Void
    let onEnvironmentEditor: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Menu {
                ForEach(projectStore.projects) { project in
                    Button(project.alias) {
                        projectStore.selectProject(project)
                        environmentStore.onProjectChanged(project)
                    }
                }
                Divider()
                Button("프로젝트 관리...") { onSettings() }
            } label: {
                Label(
                    projectStore.selectedProject?.alias ?? "프로젝트 없음",
                    systemImage: "doc.text"
                )
                .frame(minWidth: 120)
            }
            .menuStyle(.borderedButton)

            if let project = projectStore.selectedProject {
                Menu {
                    ForEach(project.environments) { env in
                        Button(env.name) {
                            environmentStore.setActive(env, for: project)
                        }
                    }
                    Divider()
                    Button("환경 관리...") { onEnvironmentEditor() }
                } label: {
                    let activeEnv = environmentStore.activeEnvironment(for: project)
                    Label(activeEnv?.name ?? "환경 없음", systemImage: "server.rack")
                        .frame(minWidth: 80)
                }
                .menuStyle(.borderedButton)
            }

            Spacer()

            HStack(spacing: 4) {
                Toggle(isOn: $showSidebar) {
                    Image(systemName: "sidebar.left")
                }
                .toggleStyle(.button)
                .help("사이드바 토글")

                Toggle(isOn: $showRequest) {
                    Image(systemName: "square.split.2x1")
                }
                .toggleStyle(.button)
                .help("요청 패널 토글")

                Toggle(isOn: $showResponse) {
                    Image(systemName: "sidebar.right")
                }
                .toggleStyle(.button)
                .help("응답 패널 토글")
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .frame(height: 44)
    }
}
```

- [ ] **Step 2: Update RootView to wire all stores and views**

Replace `SwaggerMan/Views/Root/RootView.swift` with:

```swift
import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext

    @State private var projectStore: ProjectStore?
    @State private var environmentStore: EnvironmentStore?
    @State private var operationStore: OperationStore?
    @State private var requestEditorStore: RequestEditorStore?
    @State private var historyStore: HistoryStore?

    @State private var showSidebar = true
    @State private var showRequest = true
    @State private var showResponse = true
    @State private var showProjectListEditor = false
    @State private var showEnvironmentEditor = false

    var body: some View {
        VStack(spacing: 0) {
            if let projectStore, let environmentStore,
               let operationStore, let requestEditorStore,
               let historyStore {
                TopBar(
                    projectStore: projectStore,
                    environmentStore: environmentStore,
                    showSidebar: $showSidebar,
                    showRequest: $showRequest,
                    showResponse: $showResponse,
                    onSettings: { showProjectListEditor = true },
                    onEnvironmentEditor: { showEnvironmentEditor = true }
                )
                Divider()
                HStack(spacing: 0) {
                    if showSidebar {
                        SidebarView(
                            operationStore: operationStore,
                            onSelectOperation: { op in
                                guard let project = projectStore.selectedProject else { return }
                                let env = environmentStore.activeEnvironment(for: project)
                                let baseURL = (env?.baseURL ?? project.swaggerURL)
                                    .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                                let envID = env?.id ?? UUID()
                                requestEditorStore.loadOperation(op, baseURL: baseURL, envID: envID)
                            }
                        )
                        .frame(width: 240)
                        .frame(maxHeight: .infinity)
                        Divider()
                    }
                    if showRequest {
                        RequestPaneView(
                            store: requestEditorStore,
                            activeEnvironment: projectStore.selectedProject.flatMap {
                                environmentStore.activeEnvironment(for: $0)
                            },
                            onSend: {
                                guard let project = projectStore.selectedProject else { return }
                                await requestEditorStore.send(project: project, historyStore: historyStore)
                            }
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        Divider()
                    }
                    if showResponse {
                        ResponsePaneView(store: requestEditorStore)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            } else {
                ProgressView("초기화 중...")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task {
            let ps = ProjectStore(modelContext: modelContext)
            let es = EnvironmentStore(modelContext: modelContext)
            let os = OperationStore()
            let res = RequestEditorStore()
            let hs = HistoryStore(modelContext: modelContext)
            projectStore = ps
            environmentStore = es
            operationStore = os
            requestEditorStore = res
            historyStore = hs
            // Auto-load if project already selected from last session
            if let project = ps.selectedProject {
                es.onProjectChanged(project)
                Task { try? await os.loadSpec(for: project) }
            }
        }
        .onChange(of: projectStore?.selectedProject?.id) { _, _ in
            guard let project = projectStore?.selectedProject,
                  let os = operationStore,
                  let es = environmentStore,
                  let res = requestEditorStore else { return }
            es.onProjectChanged(project)
            os.clearSpec()
            res.clearSelection()
            Task { try? await os.loadSpec(for: project) }
        }
        .sheet(isPresented: $showProjectListEditor) {
            if let ps = projectStore {
                ProjectListEditor(store: ps)
            }
        }
        .sheet(isPresented: $showEnvironmentEditor) {
            if let project = projectStore?.selectedProject,
               let es = environmentStore {
                EnvironmentEditor(project: project, store: es)
            }
        }
    }
}
```

- [ ] **Step 3: Build to check for errors**

```bash
xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(error:|Build succeeded|Build FAILED)"
```

Expected: `BUILD SUCCEEDED`. If there are errors, fix them before proceeding.

- [ ] **Step 4: Run all tests**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "(PASS|FAIL|error:|Build succeeded|Build FAILED)"
```

Expected: `BUILD SUCCEEDED` and all tests pass (at minimum the 29 from Phase 1 + new Phase 2 tests).

- [ ] **Step 5: Commit**

```bash
git add SwaggerMan/Views/Root/RootView.swift \
        SwaggerMan/Views/Root/TopBar.swift
git commit -m "feat: RootView 완성 — SidebarView/RequestPane/ResponsePane 연결, 환경 관리 메뉴 추가, 프로젝트 전환 시 spec 자동 로드"
```

---

## Self-Review

**Spec coverage check:**

| Spec item | Task |
|-----------|------|
| 사이드바 — Tag 그룹, Method 필터, 검색 | Task 5 |
| Operation 클릭 → RequestPane 로드 | Task 8 (RootView) |
| RequestPane — Params 탭 (path/query) | Task 6 |
| RequestPane — Headers 탭 | Task 6 |
| RequestPane — Body 탭 (JSON 모드) | Task 6 |
| RequestPane — Auth 탭 (읽기전용) | Task 6 |
| Send → HTTPClient 실행 | Task 4 + 8 |
| 응답 — status/timing/body/headers | Task 7 |
| 응답 본문 1MB 초과 truncate | Task 7 |
| 히스토리 자동 저장 | Task 3 + 4 |
| 히스토리 500개 한도 | Task 3 |
| cURL 복사 | Task 2 + 7 |
| SpecCache 인메모리 히트 | Task 1 |
| 환경 관리 메뉴 접근 | Task 8 |
| 프로젝트 전환 → spec 재로드 | Task 8 |

**Not in Phase 2 (intentionally deferred):**
- 즐겨찾기(⭐) — Phase 5
- 드래그 정렬 — Phase 5
- Keychain/토큰 저장 — Phase 4
- SchemaForm 자동 생성 — Phase 3
- 히스토리 UI 패널 — Phase 6
- Collection 저장 — Phase 6
- Auth 탭 실제 토큰 입력 — Phase 4
