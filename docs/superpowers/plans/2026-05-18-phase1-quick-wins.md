# Phase 1 — Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TLS 검증 비활성화, 즐겨찾기, 히스토리 패널 세 기능을 추가한다.

**Architecture:** TLS는 HTTPClient에 `disableTLS` 파라미터를 추가해 per-request TLS bypass를 지원. 즐겨찾기는 기존 `FavoriteOperation` SwiftData 모델을 활용하는 `FavoriteStore` 신규 생성. 히스토리 패널은 기존 `HistoryStore`에 `delete`를 추가하고 `SidebarView`에 섹션을 붙임. `RequestEditorStore`에 `loadFromHistory`/`restoreParams`로 히스토리 복원.

**Tech Stack:** Swift 5.9, SwiftUI, SwiftData, macOS 14+, `@Observable`, Swift Testing

---

## 현재 상태 (이미 구현됨)

- `APIEnvironment.disableTLSValidation: Bool` 필드 — 존재
- `EnvironmentDetailForm` TLS 토글 UI — 존재
- `EnvironmentStore.updateEnvironment(disableTLS:)` — 존재
- `FavoriteOperation` SwiftData 모델 — 존재
- `Project.favorites: [FavoriteOperation]` 관계 — 존재
- `HistoryStore.append/clear` — 존재

---

## 파일 구조

| 파일 | 변경 |
|---|---|
| `SwaggerMan/Services/Protocols.swift` | 수정 — HTTPClientProtocol에 `disableTLS: Bool = false` 추가 |
| `SwaggerMan/Services/HTTPClient.swift` | 수정 — TLSBypassDelegate + disableTLS 지원 |
| `SwaggerMan/Stores/RequestEditorStore.swift` | 수정 — `send`에 disableTLS 전달, `loadFromHistory`, `restoreParams` 추가 |
| `SwaggerMan/Stores/FavoriteStore.swift` | 신규 — toggle/isFavorite/move/load |
| `SwaggerMan/Stores/HistoryStore.swift` | 수정 — `delete(_:from:)` 추가 |
| `SwaggerMan/Views/Sidebar/SidebarView.swift` | 수정 — FavoritesSection, HistorySection, OperationRow 호버 ⭐ |
| `SwaggerMan/Views/Root/RootView.swift` | 수정 — FavoriteStore 주입, 히스토리 콜백 |
| `SwaggerManTests/TestHelpers/MockServices.swift` | 수정 — MockHTTPClient에 disableTLS 파라미터 |
| `SwaggerManTests/Stores/FavoriteStoreTests.swift` | 신규 |
| `SwaggerManTests/Integration/HistoryStoreDeleteTests.swift` | 신규 |
| `SwaggerManTests/Integration/RequestEditorStoreHistoryTests.swift` | 신규 |

---

## Task 1: TLS Bypass — HTTPClient

**Files:**
- Modify: `SwaggerMan/Services/Protocols.swift`
- Modify: `SwaggerMan/Services/HTTPClient.swift`
- Modify: `SwaggerManTests/TestHelpers/MockServices.swift`

- [ ] **Step 1: MockHTTPClient 프로토콜 변경 (테스트 먼저)**

`SwaggerManTests/TestHelpers/MockServices.swift`의 `MockHTTPClient`를 수정:

```swift
actor MockHTTPClient: HTTPClientProtocol {
    var getResult: Result<HTTPResponse, Error> = .success(
        HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 0)
    )
    var executeResult: Result<HTTPResponse, Error>?
    var urlBasedResults: [String: Result<HTTPResponse, Error>] = [:]
    var lastDisableTLS: Bool = false

    func setExecuteResult(_ result: Result<HTTPResponse, Error>) {
        executeResult = result
    }

    func setURLResult(for urlString: String, _ result: Result<HTTPResponse, Error>) {
        urlBasedResults[urlString] = result
    }

    func get(_ url: URL, headers _: [String: String], disableTLS: Bool = false) async throws -> HTTPResponse {
        lastDisableTLS = disableTLS
        if let result = urlBasedResults[url.absoluteString] {
            return try result.get()
        }
        return try getResult.get()
    }

    func execute(_: HTTPRequest, disableTLS: Bool = false) async throws -> HTTPResponse {
        lastDisableTLS = disableTLS
        if let executeResult { return try executeResult.get() }
        return try getResult.get()
    }
}
```

- [ ] **Step 2: 빌드 실패 확인**

```bash
xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan 2>&1 | grep "error:"
```

`Protocols.swift`와 `HTTPClient.swift`가 아직 변경 안 됐으므로 프로토콜 불일치 에러가 나야 정상.

- [ ] **Step 3: Protocols.swift 업데이트**

`SwaggerMan/Services/Protocols.swift`의 `HTTPClientProtocol`을:

```swift
protocol HTTPClientProtocol: Sendable {
    func get(_ url: URL, headers: [String: String], disableTLS: Bool) async throws -> HTTPResponse
    func execute(_ request: HTTPRequest, disableTLS: Bool) async throws -> HTTPResponse
}
```

- [ ] **Step 4: HTTPClient.swift 업데이트**

`SwaggerMan/Services/HTTPClient.swift` 전체를 다음으로 교체:

```swift
import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "HTTPClient")

actor HTTPClient: HTTPClientProtocol {
    nonisolated init() {}

    func get(_ url: URL, headers: [String: String] = [:], disableTLS: Bool = false) async throws -> HTTPResponse {
        let req = HTTPRequest(method: .get, url: url, headers: headers)
        return try await execute(req, disableTLS: disableTLS)
    }

    func execute(_ request: HTTPRequest, disableTLS: Bool = false) async throws -> HTTPResponse {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.timeoutInterval = 30
        request.headers.forEach { urlRequest.setValue($1, forHTTPHeaderField: $0) }
        urlRequest.httpBody = request.body

        log.debug("→ \(request.method.rawValue) \(request.url)")

        let session = disableTLS
            ? URLSession(configuration: .default, delegate: TLSBypassDelegate(), delegateQueue: nil)
            : URLSession.shared

        do {
            let start = Date()
            let (data, response) = try await session.data(for: urlRequest)
            let durationMs = Int(Date().timeIntervalSince(start) * 1000)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw SwaggerManError.network(.unexpectedStatus(-1, body: ""))
            }

            var headers: [String: String] = [:]
            for (rawKey, rawValue) in httpResponse.allHeaderFields {
                if let key = rawKey as? String, let val = rawValue as? String {
                    headers[key] = val
                }
            }

            log.debug("← \(httpResponse.statusCode) (\(durationMs)ms)")
            return HTTPResponse(
                statusCode: httpResponse.statusCode,
                headers: headers,
                body: data,
                durationMs: durationMs
            )
        } catch let urlError as URLError {
            throw mapURLError(urlError, host: request.url.host ?? "")
        }
    }

    private func mapURLError(_ error: URLError, host: String) -> SwaggerManError {
        switch error.code {
        case .timedOut: .network(.timeout)
        case .notConnectedToInternet, .networkConnectionLost: .network(.offline)
        case .cannotFindHost, .cannotConnectToHost: .network(.dnsFailure(host: host))
        case .serverCertificateUntrusted, .serverCertificateHasUnknownRoot:
            .network(.tlsFailure(detail: error.localizedDescription))
        default: .network(.unexpectedStatus(-1, body: error.localizedDescription))
        }
    }
}

private final class TLSBypassDelegate: NSObject, URLSessionDelegate, @unchecked Sendable {
    func urlSession(
        _: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust
        else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}
```

- [ ] **Step 5: SpecCache 호출부 업데이트 (disableTLS: false)**

`SpecCache.swift`에서 `httpClient.get` 호출이 있다면 `disableTLS: false` 명시:

```bash
grep -n "httpClient.get\|httpClient.execute" SwaggerMan/Services/SpecCache.swift SwaggerMan/Stores/OperationStore.swift
```

각 호출에 `disableTLS: false` 추가 (기본값이므로 없어도 됨 — 빌드 확인으로 검증).

- [ ] **Step 6: RequestEditorStore.send에 disableTLS 전달**

`SwaggerMan/Stores/RequestEditorStore.swift`의 `send` 메서드 시그니처와 내부:

```swift
func send(project: Project, historyStore: HistoryStore, disableTLS: Bool = false) async {
    guard let op = selectedOperation else { return }
    isSending = true
    defer { isSending = false }
    sendError = nil

    do {
        let request = try buildRequest(op: op)
        lastCurlString = CurlBuilder.build(request)
        let res = try await httpClient.execute(request, disableTLS: disableTLS)
        response = res

        let reqHeadersJSON = jsonString(from: request.headers)
        let resHeadersJSON = jsonString(from: res.headers)
        let bodyStr = res.bodyString ?? ""
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
            responseStatus: res.statusCode,
            responseHeadersJSON: resHeadersJSON,
            responseBody: truncatedBody,
            responseSize: res.body.count,
            durationMs: res.durationMs,
            project: project
        )
        historyStore.append(item, to: project)
    } catch {
        sendError = error
    }
}
```

- [ ] **Step 7: RootView onSend에 disableTLS 전달**

`SwaggerMan/Views/Root/RootView.swift`의 `onSend` 클로저:

```swift
onSend: {
    guard let project = projectStore.selectedProject,
          let env = environmentStore.activeEnvironment(for: project) else { return }
    await requestEditorStore.send(
        project: project,
        historyStore: historyStore,
        disableTLS: env.disableTLSValidation
    )
}
```

- [ ] **Step 8: 빌드 + 테스트 통과 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" 2>&1 | tail -3
```

Expected: `Test run with N tests in N suites passed`

- [ ] **Step 9: 커밋**

```bash
git add SwaggerMan/Services/Protocols.swift SwaggerMan/Services/HTTPClient.swift \
  SwaggerMan/Stores/RequestEditorStore.swift SwaggerMan/Views/Root/RootView.swift \
  SwaggerManTests/TestHelpers/MockServices.swift
git commit -m "feat: TLS 검증 비활성화 — HTTPClient per-request bypass 지원"
```

---

## Task 2: FavoriteStore

**Files:**
- Create: `SwaggerMan/Stores/FavoriteStore.swift`
- Create: `SwaggerManTests/Stores/FavoriteStoreTests.swift`

- [ ] **Step 1: 실패 테스트 작성**

`SwaggerManTests/Stores/FavoriteStoreTests.swift` 생성:

```swift
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("FavoriteStore Tests", .serialized)
@MainActor
struct FavoriteStoreTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeProject(in ctx: ModelContext) throws -> Project {
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "Test", swaggerURL: "https://api.test")
        return store.projects[0]
    }

    @Test("toggle — add favorite")
    func toggleAdd() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/users", for: project)

        #expect(store.favorites.count == 1)
        #expect(store.favorites[0].method == "GET")
        #expect(store.favorites[0].path == "/users")
    }

    @Test("toggle — remove existing favorite")
    func toggleRemove() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/users", for: project)
        store.toggle(method: "GET", path: "/users", for: project)

        #expect(store.favorites.isEmpty)
    }

    @Test("isFavorite — true after add")
    func isFavoriteTrue() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "POST", path: "/login", for: project)

        #expect(store.isFavorite(method: "POST", path: "/login") == true)
        #expect(store.isFavorite(method: "GET", path: "/login") == false)
    }

    @Test("move — sortOrder 재정렬")
    func moveReorders() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/a", for: project)
        store.toggle(method: "POST", path: "/b", for: project)
        store.toggle(method: "DELETE", path: "/c", for: project)

        // move item at index 2 to index 0
        store.move(from: IndexSet(integer: 2), to: 0)

        #expect(store.favorites[0].path == "/c")
        #expect(store.favorites[0].sortOrder == 0)
        #expect(store.favorites[1].sortOrder == 1)
        #expect(store.favorites[2].sortOrder == 2)
    }

    @Test("load — sortOrder 기준 정렬")
    func loadSortsByOrder() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/z", for: project)
        store.toggle(method: "POST", path: "/a", for: project)

        let store2 = FavoriteStore(modelContext: ctx)
        store2.load(for: project)

        #expect(store2.favorites[0].path == "/z")
        #expect(store2.favorites[1].path == "/a")
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/FavoriteStoreTests \
  2>&1 | grep -E "error:|FAILED|cannot find"
```

Expected: `error: cannot find type 'FavoriteStore'`

- [ ] **Step 3: FavoriteStore 구현**

`SwaggerMan/Stores/FavoriteStore.swift` 생성:

```swift
import os.log
import SwiftData
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "FavoriteStore")

@Observable
@MainActor
final class FavoriteStore {
    private(set) var favorites: [FavoriteOperation] = []
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func load(for project: Project) {
        favorites = project.favorites.sorted { $0.sortOrder < $1.sortOrder }
    }

    func toggle(method: String, path: String, for project: Project) {
        if let existing = favorites.first(where: { $0.method == method && $0.path == path }) {
            remove(existing, from: project)
        } else {
            add(method: method, path: path, to: project)
        }
    }

    func isFavorite(method: String, path: String) -> Bool {
        favorites.contains { $0.method == method && $0.path == path }
    }

    func move(from source: IndexSet, to destination: Int) {
        var reordered = favorites
        reordered.move(fromOffsets: source, toOffset: destination)
        for (idx, item) in reordered.enumerated() {
            item.sortOrder = idx
        }
        favorites = reordered
        save()
    }

    private func add(method: String, path: String, to project: Project) {
        let nextOrder = (favorites.map(\.sortOrder).max() ?? -1) + 1
        let fav = FavoriteOperation(method: method, path: path, sortOrder: nextOrder, project: project)
        modelContext.insert(fav)
        project.favorites.append(fav)
        save()
        load(for: project)
        log.debug("Favorite added: \(method) \(path)")
    }

    private func remove(_ item: FavoriteOperation, from project: Project) {
        project.favorites.removeAll { $0.id == item.id }
        modelContext.delete(item)
        save()
        load(for: project)
        log.debug("Favorite removed: \(item.method) \(item.path)")
    }

    private func save() {
        do {
            try modelContext.save()
        } catch {
            log.error("FavoriteStore save failed: \(error.localizedDescription)")
        }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/FavoriteStoreTests \
  2>&1 | tail -3
```

Expected: `Test run with 5 tests in 1 suite passed`

- [ ] **Step 5: 커밋**

```bash
git add SwaggerMan/Stores/FavoriteStore.swift \
  SwaggerManTests/Stores/FavoriteStoreTests.swift
git commit -m "feat: FavoriteStore 추가 — toggle/isFavorite/move/load"
```

---

## Task 3: HistoryStore.delete

**Files:**
- Modify: `SwaggerMan/Stores/HistoryStore.swift`
- Create: `SwaggerManTests/Integration/HistoryStoreDeleteTests.swift`

- [ ] **Step 1: 실패 테스트 작성**

`SwaggerManTests/Integration/HistoryStoreDeleteTests.swift` 생성:

```swift
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("HistoryStore Delete Tests", .serialized)
@MainActor
struct HistoryStoreDeleteTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeProject(in ctx: ModelContext) throws -> Project {
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "API", swaggerURL: "https://api.test")
        return store.projects[0]
    }

    func makeHistoryItem(project: Project) -> HistoryItem {
        HistoryItem(
            environmentID: UUID(),
            method: "GET", path: "/users",
            fullURL: "https://api.test/users",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "[]",
            responseSize: 2,
            durationMs: 50,
            project: project
        )
    }

    @Test("delete — 단건 삭제")
    func deleteSingle() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let historyStore = HistoryStore(modelContext: ctx)

        let item1 = makeHistoryItem(project: project)
        let item2 = makeHistoryItem(project: project)
        ctx.insert(item1)
        ctx.insert(item2)
        project.history = [item1, item2]
        historyStore.loadHistory(for: project)

        historyStore.delete(item1, from: project)

        #expect(historyStore.items.count == 1)
        #expect(historyStore.items[0].id == item2.id)
    }

    @Test("delete — 없는 항목 삭제 시 크래시 없음")
    func deleteNonExistent() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let historyStore = HistoryStore(modelContext: ctx)
        historyStore.loadHistory(for: project)

        let orphan = makeHistoryItem(project: project)
        historyStore.delete(orphan, from: project)

        #expect(historyStore.items.isEmpty)
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/HistoryStoreDeleteTests \
  2>&1 | grep -E "error:|cannot find"
```

Expected: `error: value of type 'HistoryStore' has no member 'delete'`

- [ ] **Step 3: HistoryStore에 delete 추가**

`SwaggerMan/Stores/HistoryStore.swift`의 `// MARK: - Public` 섹션에 추가:

```swift
func delete(_ item: HistoryItem, from project: Project) {
    project.history.removeAll { $0.id == item.id }
    modelContext.delete(item)
    save()
    loadHistory(for: project)
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/HistoryStoreDeleteTests \
  2>&1 | tail -3
```

Expected: `Test run with 2 tests in 1 suite passed`

- [ ] **Step 5: 커밋**

```bash
git add SwaggerMan/Stores/HistoryStore.swift \
  SwaggerManTests/Integration/HistoryStoreDeleteTests.swift
git commit -m "feat: HistoryStore.delete 단건 삭제 추가"
```

---

## Task 4: RequestEditorStore — 히스토리 복원

**Files:**
- Modify: `SwaggerMan/Stores/RequestEditorStore.swift`
- Create: `SwaggerManTests/Integration/RequestEditorStoreHistoryTests.swift`

- [ ] **Step 1: 실패 테스트 작성**

`SwaggerManTests/Integration/RequestEditorStoreHistoryTests.swift` 생성:

```swift
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("RequestEditorStore History Tests", .serialized)
@MainActor
struct RequestEditorStoreHistoryTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeOp() -> ParsedOperation {
        ParsedOperation(
            id: "GET /users", method: .get, path: "/users",
            operationId: nil, summary: nil, description: nil,
            tags: [], parameters: [], requestBody: nil,
            responseDescriptions: [:]
        )
    }

    func makeEnv() -> APIEnvironment {
        APIEnvironment(name: "Dev", baseURL: "https://api.test")
    }

    func makeHistoryItem() -> HistoryItem {
        HistoryItem(
            environmentID: UUID(),
            method: "GET", path: "/users",
            fullURL: "https://api.test/users",
            requestHeadersJSON: #"{"Authorization":"Bearer tok"}"#,
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: #"{"Content-Type":"application/json"}"#,
            responseBody: #"[{"id":1}]"#,
            responseSize: 9,
            durationMs: 120
        )
    }

    @Test("restoreParams — requestHeadersJSON 헤더로 복원")
    func restoreParamsHeaders() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let item = makeHistoryItem()

        store.restoreParams(from: item)

        let authHeader = store.requestHeaders.first { $0.key == "Authorization" }
        #expect(authHeader?.value == "Bearer tok")
    }

    @Test("restoreParams — requestBody 복원")
    func restoreParamsBody() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let item = HistoryItem(
            environmentID: UUID(),
            method: "POST", path: "/users",
            fullURL: "https://api.test/users",
            requestHeadersJSON: "{}",
            requestBody: #"{"name":"Alice"}"#,
            responseStatus: 201,
            responseHeadersJSON: "{}",
            responseBody: "{}",
            responseSize: 2,
            durationMs: 80
        )

        store.restoreParams(from: item)

        #expect(store.bodyJSON == #"{"name":"Alice"}"#)
    }

    @Test("loadFromHistory — 응답 복원")
    func loadFromHistoryRestoresResponse() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOp()
        let env = makeEnv()
        let item = makeHistoryItem()

        store.loadFromHistory(item, operation: op, environment: env, securityHeaders: [:])

        #expect(store.response?.statusCode == 200)
        #expect(store.response?.durationMs == 120)
        #expect(store.response?.bodyString == #"[{"id":1}]"#)
    }

    @Test("loadFromHistory — 요청 에디터 상태 복원")
    func loadFromHistoryRestoresEditor() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOp()
        let env = makeEnv()
        let item = makeHistoryItem()

        store.loadFromHistory(item, operation: op, environment: env, securityHeaders: [:])

        let authHeader = store.requestHeaders.first { $0.key == "Authorization" }
        #expect(authHeader?.value == "Bearer tok")
        #expect(store.selectedOperation?.id == "GET /users")
    }
}
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/RequestEditorStoreHistoryTests \
  2>&1 | grep -E "error:|cannot find"
```

Expected: `error: value of type 'RequestEditorStore' has no member 'restoreParams'`

- [ ] **Step 3: RequestEditorStore에 메서드 추가**

`SwaggerMan/Stores/RequestEditorStore.swift`의 `// MARK: - Public Methods` 섹션에 추가:

```swift
func loadFromHistory(_ item: HistoryItem, operation: ParsedOperation,
                     environment: APIEnvironment, securityHeaders: [String: String]) {
    loadOperation(operation, baseURL: environment.baseURL, environment: environment,
                  securityHeaders: securityHeaders)
    restoreParams(from: item)
    response = HTTPResponse(
        statusCode: item.responseStatus,
        headers: (try? JSONDecoder().decode([String: String].self,
                                            from: Data(item.responseHeadersJSON.utf8))) ?? [:],
        body: Data(item.responseBody.utf8),
        durationMs: item.durationMs
    )
}

func restoreParams(from item: HistoryItem) {
    if let body = item.requestBody {
        bodyJSON = body
    }
    let headers = (try? JSONDecoder().decode([String: String].self,
                                             from: Data(item.requestHeadersJSON.utf8))) ?? [:]
    if !headers.isEmpty {
        requestHeaders = headers.map { RequestParam(key: $0.key, value: $0.value, enabled: true) }
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" -only-testing SwaggerManTests/RequestEditorStoreHistoryTests \
  2>&1 | tail -3
```

Expected: `Test run with 4 tests in 1 suite passed`

- [ ] **Step 5: 커밋**

```bash
git add SwaggerMan/Stores/RequestEditorStore.swift \
  SwaggerManTests/Integration/RequestEditorStoreHistoryTests.swift
git commit -m "feat: RequestEditorStore — loadFromHistory, restoreParams 히스토리 복원"
```

---

## Task 5: SidebarView — 즐겨찾기 섹션 + HistoryRow

**Files:**
- Modify: `SwaggerMan/Views/Sidebar/SidebarView.swift`

- [ ] **Step 1: SidebarView 시그니처 확장**

`SwaggerMan/Views/Sidebar/SidebarView.swift`의 `SidebarView` struct에 프로퍼티 추가:

```swift
struct SidebarView: View {
    @Bindable var operationStore: OperationStore
    let selectedOperationID: String?
    let onSelectOperation: (ParsedOperation) -> Void

    // 즐겨찾기
    let favoriteStore: FavoriteStore
    let project: Project
    let onToggleFavorite: (ParsedOperation) -> Void

    // 히스토리
    let historyStore: HistoryStore
    let onSelectHistory: (HistoryItem) -> Void
    let onReplayHistory: (HistoryItem) -> Void
    let onDeleteHistory: (HistoryItem) -> Void
```

- [ ] **Step 2: 즐겨찾기 섹션 추가**

`SidebarView.body`의 `List` 앞에 즐겨찾기 섹션 삽입. 기존 `List` 블록을 새 `List` 하나로 통합:

```swift
List {
    // ── 즐겨찾기 섹션 ──
    if !favoriteStore.favorites.isEmpty {
        Section {
            ForEach(favoriteStore.favorites) { fav in
                if let op = operationStore.operations.first(where: {
                    $0.method.rawValue == fav.method && $0.path == fav.path
                }) {
                    Button { onSelectOperation(op) } label: {
                        OperationRowView(
                            operation: op,
                            isSelected: op.id == selectedOperationID,
                            isFavorite: true,
                            onToggleFavorite: { onToggleFavorite(op) }
                        )
                    }
                    .buttonStyle(.plain)
                    .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
                    .listRowBackground(Color.clear)
                }
            }
            .onMove { source, dest in favoriteStore.move(from: source, to: dest) }
        } header: {
            Label("즐겨찾기", systemImage: "star.fill")
                .foregroundStyle(.yellow)
                .font(.caption.weight(.semibold))
        }
    }

    // ── Operations 섹션 ──
    ForEach(operationStore.operationsByTag, id: \.tag) { group in
        Section(group.tag) {
            ForEach(group.operations) { op in
                Button { onSelectOperation(op) } label: {
                    OperationRowView(
                        operation: op,
                        isSelected: op.id == selectedOperationID,
                        isFavorite: favoriteStore.isFavorite(method: op.method.rawValue, path: op.path),
                        onToggleFavorite: { onToggleFavorite(op) }
                    )
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
                .listRowBackground(Color.clear)
            }
        }
    }

    // ── 히스토리 섹션 ──
    if !historyStore.items.isEmpty {
        Section {
            ForEach(historyStore.items.prefix(100)) { item in
                HistoryRowView(
                    item: item,
                    onSelect: { onSelectHistory(item) },
                    onReplay: { onReplayHistory(item) }
                )
                .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                .listRowBackground(Color.clear)
                .contextMenu {
                    Button("삭제", role: .destructive) { onDeleteHistory(item) }
                    Button("히스토리 전체 삭제", role: .destructive) {
                        historyStore.clear(for: project)
                    }
                }
            }
        } header: {
            HStack {
                Label("히스토리", systemImage: "clock")
                    .font(.caption.weight(.semibold))
                Spacer()
                Text("\(historyStore.items.count)")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }
}
.listStyle(.plain)
.scrollContentBackground(.hidden)
```

- [ ] **Step 3: OperationRowView에 즐겨찾기 호버 ⭐ 추가**

기존 `OperationRowView`를 교체:

```swift
struct OperationRowView: View {
    let operation: ParsedOperation
    var isSelected: Bool = false
    var isFavorite: Bool = false
    var onToggleFavorite: (() -> Void)? = nil

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 6) {
            HStack(spacing: 3) {
                Image(systemName: operation.method.sfSymbol)
                    .font(.system(size: 9).bold())
                Text(operation.method.rawValue)
                    .font(.system(.caption, design: .monospaced).bold())
            }
            .foregroundStyle(operation.method.swiftUIColor)
            .frame(width: 68, alignment: .leading)

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

            Spacer()

            if (isHovered || isFavorite), let onToggle = onToggleFavorite {
                Button(action: onToggle) {
                    Image(systemName: isFavorite ? "star.fill" : "star")
                        .font(.system(size: 11))
                        .foregroundStyle(isFavorite ? .yellow : .secondary)
                }
                .buttonStyle(.plain)
                .help(isFavorite ? "즐겨찾기 제거" : "즐겨찾기 추가")
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            isSelected
                ? operation.method.swiftUIColor.opacity(0.18)
                : Color.clear
        )
        .clipShape(.rect(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(
                    isSelected ? operation.method.swiftUIColor.opacity(0.5) : Color.clear,
                    lineWidth: 1
                )
        )
        .onHover { isHovered = $0 }
    }
}
```

- [ ] **Step 4: HistoryRowView 컴포넌트 추가**

`SidebarView.swift` 하단에 추가:

```swift
// MARK: - History Row

struct HistoryRowView: View {
    let item: HistoryItem
    let onSelect: () -> Void
    let onReplay: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 6) {
            Text(item.method)
                .font(.system(.caption2, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(methodColor.opacity(0.12))
                .clipShape(.rect(cornerRadius: 3))

            VStack(alignment: .leading, spacing: 1) {
                Text(item.path)
                    .font(.system(.caption, design: .monospaced))
                    .lineLimit(1)
                Text(item.executedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Text("\(item.responseStatus)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(statusColor)

            if isHovered {
                Button(action: onReplay) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("요청 에디터에 불러오기 (응답 초기화)")
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
    }

    private var methodColor: Color {
        switch item.method {
        case "GET": .green
        case "POST": .blue
        case "PUT": .orange
        case "DELETE": .red
        case "PATCH": .purple
        default: .secondary
        }
    }

    private var statusColor: Color {
        switch item.responseStatus {
        case 200 ..< 300: .green
        case 300 ..< 400: .yellow
        case 400 ..< 500: .orange
        default: .red
        }
    }
}
```

- [ ] **Step 5: 기존 ViewBody 테스트의 SidebarView 호출 업데이트**

`SwaggerManTests/Views/ViewBodyTests.swift`와 `SwaggerManTests/Views/ViewBodyRenderTests.swift`에서 `SidebarView(...)` 생성 부분을 찾아 새 파라미터 추가:

```bash
grep -n "SidebarView(" SwaggerManTests/Views/ViewBodyTests.swift SwaggerManTests/Views/ViewBodyRenderTests.swift
```

각 호출에 다음 파라미터 추가 (테스트용 더미 값):

```swift
SidebarView(
    operationStore: opStore,
    selectedOperationID: nil,
    onSelectOperation: { _ in },
    favoriteStore: FavoriteStore(modelContext: container.mainContext),
    project: project,
    onToggleFavorite: { _ in },
    historyStore: HistoryStore(modelContext: container.mainContext),
    onSelectHistory: { _ in },
    onReplayHistory: { _ in },
    onDeleteHistory: { _ in }
)
```

- [ ] **Step 6: 빌드 확인 (컴파일 에러 없음)**

```bash
xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan 2>&1 | grep "error:" | head -10
```

Expected: 에러 없음. RootView 호출부가 아직 업데이트 안 됐으므로 거기서 에러 나면 Task 6에서 수정.

- [ ] **Step 7: 커밋**

```bash
git add SwaggerMan/Views/Sidebar/SidebarView.swift \
  SwaggerManTests/Views/ViewBodyTests.swift \
  SwaggerManTests/Views/ViewBodyRenderTests.swift
git commit -m "feat: 사이드바 즐겨찾기 섹션 + HistoryRow + OperationRow 호버 ⭐"
```

---

## Task 6: RootView — FavoriteStore 주입 + 콜백 연결

**Files:**
- Modify: `SwaggerMan/Views/Root/RootView.swift`

- [ ] **Step 1: FavoriteStore 상태 추가**

`RootView` 상단 `@State` 목록에 추가:

```swift
@State private var favoriteStore: FavoriteStore?
```

- [ ] **Step 2: .task 내 초기화 추가**

`.task` 클로저 안에서 `historyStore = hs` 다음에:

```swift
let fs = FavoriteStore(modelContext: modelContext)
favoriteStore = fs
if let project = ps.selectedProject {
    fs.load(for: project)
    hs.loadHistory(for: project)
}
```

- [ ] **Step 3: .onChange에 FavoriteStore 로드 추가**

`.onChange(of: projectStore?.selectedProject?.id)` 핸들러 안에:

```swift
if let project = projectStore?.selectedProject {
    favoriteStore?.load(for: project)
    historyStore?.loadHistory(for: project)
}
```

- [ ] **Step 4: SidebarView 호출 업데이트**

`RootView.body`의 `SidebarView(...)` 호출을 업데이트:

```swift
if let favoriteStore, let historyStore,
   let project = projectStore.selectedProject
{
    SidebarView(
        operationStore: operationStore,
        selectedOperationID: requestEditorStore.selectedOperation?.id,
        onSelectOperation: { op in
            guard let project = projectStore.selectedProject,
                  let env = environmentStore.activeEnvironment(for: project) else { return }
            let baseURL = env.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            requestEditorStore.loadOperation(op, baseURL: baseURL, environment: env,
                                             securityHeaders: operationStore.computedSecurityHeaders)
            projectStore.saveLastOperationID(op.id, for: project)
        },
        favoriteStore: favoriteStore,
        project: project,
        onToggleFavorite: { op in
            favoriteStore.toggle(method: op.method.rawValue, path: op.path, for: project)
        },
        historyStore: historyStore,
        onSelectHistory: { item in
            guard let op = operationStore.operations.first(where: {
                      $0.method.rawValue == item.method && $0.path == item.path
                  }),
                  let env = environmentStore.activeEnvironment(for: project) else { return }
            requestEditorStore.loadFromHistory(item, operation: op, environment: env,
                                               securityHeaders: operationStore.computedSecurityHeaders)
        },
        onReplayHistory: { item in
            guard let op = operationStore.operations.first(where: {
                      $0.method.rawValue == item.method && $0.path == item.path
                  }),
                  let env = environmentStore.activeEnvironment(for: project) else { return }
            let baseURL = env.baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            requestEditorStore.loadOperation(op, baseURL: baseURL, environment: env,
                                             securityHeaders: operationStore.computedSecurityHeaders)
            requestEditorStore.restoreParams(from: item)
        },
        onDeleteHistory: { item in
            historyStore.delete(item, from: project)
        }
    )
    .frame(width: sidebarWidth)
}
```

- [ ] **Step 5: 빌드 + 전체 테스트**

```bash
xcodebuild test -project SwaggerMan.xcodeproj -scheme SwaggerManTests \
  -destination "platform=macOS" 2>&1 | tail -5
```

Expected: `Test run with N tests in N suites passed`

- [ ] **Step 6: 앱 실행 — 동작 확인**

```bash
xcodebuild build -project SwaggerMan.xcodeproj -scheme SwaggerMan -configuration Debug \
  2>&1 | tail -2
open ~/Library/Developer/Xcode/DerivedData/SwaggerMan-*/Build/Products/Debug/SwaggerMan.app
```

확인 항목:
- [ ] Operation 행 호버 시 ⭐ 나타남
- [ ] 클릭 시 사이드바 즐겨찾기 섹션 상단에 등록됨
- [ ] 즐겨찾기 드래그 순서 변경됨
- [ ] Send 실행 후 히스토리 섹션에 항목 나타남
- [ ] 히스토리 클릭 → 요청 에디터 + 응답 복원됨
- [ ] ▶ 버튼 클릭 → 요청 에디터만 복원, 응답 초기화됨
- [ ] 환경 설정에서 TLS 토글 → 자체서명 서버 호출 가능

- [ ] **Step 7: SwiftLint 통과 확인**

```bash
swiftlint --strict 2>&1 | tail -3
```

Expected: `Done linting! Found 0 violations, 0 serious`

- [ ] **Step 8: 최종 커밋**

```bash
git add SwaggerMan/Views/Root/RootView.swift
git commit -m "feat: RootView — FavoriteStore 주입 + 히스토리 복원 콜백 연결"
```

---

## 완료 기준

- [ ] 전체 테스트 통과 (기존 324개 + 신규 테스트)
- [ ] SwiftLint 0 violations
- [ ] 앱 빌드 + 동작 확인 6개 항목 전부 통과
