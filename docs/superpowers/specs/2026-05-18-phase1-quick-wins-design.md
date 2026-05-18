# Phase 1 — Quick Wins 설계 문서

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 기존 인프라(모델·스토어)를 활용해 TLS 검증 비활성화, 즐겨찾기, 히스토리 패널 세 기능을 추가한다.

**Architecture:** 모든 기능은 SwiftData 모델이 이미 존재하거나(FavoriteOperation, HistoryItem) 소규모 모델 확장으로 처리되며, 새 Store는 기존 HistoryStore 패턴을 따른다. UI는 기존 SidebarView에 섹션을 추가하는 방식으로 최소 침범.

**Tech Stack:** Swift 5.9, SwiftUI, SwiftData, macOS 14+, `@Observable`

---

## 1. TLS 검증 비활성화

### 1.1 데이터 모델 변경

`APIEnvironment` 모델에 필드 추가:

```swift
// SwaggerMan/Persistence/APIEnvironment.swift
var disableTLSValidation: Bool = false
```

### 1.2 HTTPClient 변경

`HTTPClient`가 TLS 검증 비활성화를 지원하도록 변경:

```swift
// SwaggerMan/Services/HTTPClient.swift
actor HTTPClient: HTTPClientProtocol {
    private func makeSession(disableTLS: Bool) -> URLSession {
        if disableTLS {
            let config = URLSessionConfiguration.default
            // TLSDelegate handles certificate bypass
            return URLSession(configuration: config, delegate: TLSBypassDelegate(), delegateQueue: nil)
        }
        return URLSession.shared
    }
}

// 같은 파일에 추가
private final class TLSBypassDelegate: NSObject, URLSessionDelegate {
    func urlSession(_ session: URLSession,
                    didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        completionHandler(.useCredential, URLCredential(trust: challenge.protectionSpace.serverTrust!))
    }
}
```

`HTTPClientProtocol`에 `disableTLS` 파라미터 추가:

```swift
protocol HTTPClientProtocol: Sendable {
    func get(_ url: URL, headers: [String: String], disableTLS: Bool) async throws -> HTTPResponse
    func execute(_ request: HTTPRequest, disableTLS: Bool) async throws -> HTTPResponse
}
```

기존 호출부(`RequestEditorStore.send`)에서 현재 환경의 `disableTLSValidation` 값을 전달.

### 1.3 EnvironmentDetailForm UI 변경

```swift
// SwaggerMan/Views/Settings/EnvironmentEditor.swift
Section("고급") {
    Toggle(isOn: $env.disableTLSValidation) {
        Label("TLS 검증 비활성화", systemImage: "lock.slash")
    }
    if env.disableTLSValidation {
        Text("⚠️ 자체서명 인증서를 허용합니다. 개발 환경에서만 사용하세요.")
            .font(.caption)
            .foregroundStyle(.orange)
    }
}
```

---

## 2. 즐겨찾기 (Favorites)

### 2.1 FavoriteStore 신규 생성

`HistoryStore` 패턴을 동일하게 따름:

```swift
// SwaggerMan/Stores/FavoriteStore.swift
@Observable
@MainActor
final class FavoriteStore {
    private(set) var favorites: [FavoriteOperation] = []
    private let modelContext: ModelContext

    init(modelContext: ModelContext) { self.modelContext = modelContext }

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
        for (idx, item) in reordered.enumerated() { item.sortOrder = idx }
        favorites = reordered
        save()
    }

    private func add(method: String, path: String, to project: Project) { ... }
    private func remove(_ item: FavoriteOperation, from project: Project) { ... }
    private func save() { try? modelContext.save() }
}
```

### 2.2 SidebarView 즐겨찾기 섹션

사이드바 최상단에 즐겨찾기 섹션 추가 (비어있으면 숨김):

```swift
// SidebarView.swift 내 즐겨찾기 섹션
if !favoriteStore.favorites.isEmpty {
    Section {
        ForEach(favoriteStore.favorites) { fav in
            FavoriteRow(fav: fav, onSelect: { ... })
                .contextMenu {
                    Button("즐겨찾기 제거", role: .destructive) {
                        favoriteStore.toggle(method: fav.method, path: fav.path, for: project)
                    }
                }
        }
        .onMove { source, dest in favoriteStore.move(from: source, to: dest) }
    } header: {
        Label("즐겨찾기", systemImage: "star.fill")
            .foregroundStyle(.yellow)
    }
}
```

### 2.3 Operation 행 호버 시 ⭐ 버튼

`OperationRow`에 hover 상태 추가:

```swift
// SidebarView.swift OperationRow
@State private var isHovered = false

HStack {
    // 기존 method badge + path
    Spacer()
    if isHovered || isFavorite {
        Button { favoriteStore.toggle(method: op.method.rawValue, path: op.path, for: project) } label: {
            Image(systemName: isFavorite ? "star.fill" : "star")
                .foregroundStyle(isFavorite ? .yellow : .secondary)
        }
        .buttonStyle(.plain)
    }
}
.onHover { isHovered = $0 }
```

### 2.4 RootView에 FavoriteStore 주입

```swift
// RootView.swift
@State private var favoriteStore: FavoriteStore?

// .task 내
let fs = FavoriteStore(modelContext: modelContext)
favoriteStore = fs
fs.load(for: project)
```

---

## 3. 히스토리 패널

### 3.1 SidebarView 히스토리 섹션

사이드바 하단에 collapsible 히스토리 섹션:

```swift
// SidebarView.swift 내 히스토리 섹션
Section {
    LazyVStack(spacing: 0) {
        ForEach(historyStore.items.prefix(100)) { item in
            HistoryRow(
                item: item,
                onSelect: { onSelectHistory(item) },
                onReplay: { onReplayHistory(item) }
            )
            .contextMenu {
                Button("삭제", role: .destructive) {
                    historyStore.delete(item, from: project)
                }
                Button("히스토리 전체 삭제", role: .destructive) {
                    historyStore.clear(for: project)
                }
            }
        }
    }
} header: {
    HStack {
        Label("히스토리", systemImage: "clock")
        Spacer()
        Text("\(historyStore.items.count)")
            .font(.caption2)
            .foregroundStyle(.secondary)
    }
}
```

### 3.2 HistoryRow 컴포넌트

```swift
struct HistoryRow: View {
    let item: HistoryItem
    let onSelect: () -> Void
    let onReplay: () -> Void
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 6) {
            // method badge
            Text(item.method)
                .font(.system(.caption2, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .padding(.horizontal, 4)
                .background(methodColor.opacity(0.12))
                .clipShape(.rect(cornerRadius: 3))

            VStack(alignment: .leading, spacing: 1) {
                Text(item.path)
                    .font(.caption)
                    .lineLimit(1)
                Text(item.executedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            // status badge
            Text("\(item.responseStatus)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(statusColor)

            // replay button (hover only)
            if isHovered {
                Button(action: onReplay) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .help("요청 에디터에 불러오기 (응답 초기화)")
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
    }
}
```

### 3.3 히스토리 복원 콜백

`RootView`에서 히스토리 선택 처리:

```swift
// onSelectHistory: 요청 에디터 + 과거 응답 복원
func onSelectHistory(_ item: HistoryItem) {
    guard let op = operationStore.operations.first(where: { $0.method.rawValue == item.method && $0.path == item.path }),
          let env = environmentStore.activeEnvironment(for: project) else { return }
    requestEditorStore.loadFromHistory(item, operation: op, environment: env,
                                       securityHeaders: operationStore.computedSecurityHeaders)
}

// onReplayHistory: 요청 에디터만 복원, 응답 초기화
func onReplayHistory(_ item: HistoryItem) {
    guard let op = operationStore.operations.first(where: { $0.method.rawValue == item.method && $0.path == item.path }),
          let env = environmentStore.activeEnvironment(for: project) else { return }
    requestEditorStore.loadOperation(op, baseURL: env.baseURL, environment: env,
                                     securityHeaders: operationStore.computedSecurityHeaders)
    // pathParams/queryParams/headers/body를 history 값으로 덮어씀
    requestEditorStore.restoreParams(from: item)
}
```

### 3.4 RequestEditorStore 확장

```swift
// RequestEditorStore.swift
func loadFromHistory(_ item: HistoryItem, operation: ParsedOperation,
                     environment: APIEnvironment, securityHeaders: [String: String]) {
    loadOperation(operation, baseURL: environment.baseURL, environment: environment,
                  securityHeaders: securityHeaders)
    restoreParams(from: item)
    // 과거 응답 복원
    response = HTTPResponse(
        statusCode: item.responseStatus,
        headers: (try? JSONDecoder().decode([String: String].self,
                                            from: Data(item.responseHeadersJSON.utf8))) ?? [:],
        body: Data(item.responseBody.utf8),
        durationMs: item.durationMs
    )
}

func restoreParams(from item: HistoryItem) {
    // item.requestHeadersJSON, item.requestBody 파싱해서 채움
    if let body = item.requestBody { bodyJSON = body }
    let headers = (try? JSONDecoder().decode([String: String].self,
                                             from: Data(item.requestHeadersJSON.utf8))) ?? [:]
    requestHeaders = headers.map { RequestParam(key: $0.key, value: $0.value, enabled: true) }
}
```

### 3.5 HistoryStore에 delete 메서드 추가

```swift
// HistoryStore.swift
func delete(_ item: HistoryItem, from project: Project) {
    project.history.removeAll { $0.id == item.id }
    modelContext.delete(item)
    save()
    loadHistory(for: project)
}
```

---

## 4. 파일 변경 요약

| 파일 | 변경 유형 |
|---|---|
| `SwaggerMan/Persistence/APIEnvironment.swift` | 수정 — `disableTLSValidation` 필드 추가 |
| `SwaggerMan/Services/Protocols.swift` | 수정 — `disableTLS` 파라미터 추가 |
| `SwaggerMan/Services/HTTPClient.swift` | 수정 — TLSBypassDelegate + disableTLS 지원 |
| `SwaggerMan/Stores/FavoriteStore.swift` | 신규 |
| `SwaggerMan/Stores/HistoryStore.swift` | 수정 — `delete` 메서드 추가 |
| `SwaggerMan/Stores/RequestEditorStore.swift` | 수정 — `loadFromHistory`, `restoreParams` 추가 |
| `SwaggerMan/Views/Settings/EnvironmentEditor.swift` | 수정 — TLS 토글 UI |
| `SwaggerMan/Views/Sidebar/SidebarView.swift` | 수정 — 즐겨찾기 섹션 + 히스토리 섹션 + ⭐ 버튼 |
| `SwaggerMan/Views/Root/RootView.swift` | 수정 — FavoriteStore 주입, 히스토리 콜백 |
| `SwaggerManTests/TestHelpers/MockServices.swift` | 수정 — `MockHTTPClient.get/execute`에 `disableTLS` 파라미터 추가 |
| `SwaggerManTests/...` | 신규 — 각 기능 단위 테스트 |

---

## 5. 테스트 범위

- `FavoriteStoreTests`: toggle(add/remove), isFavorite, move(sortOrder 재정렬)
- `HistoryStoreTests`: delete(단건), clear(전체) — 기존 테스트 확장
- `RequestEditorStoreTests`: loadFromHistory(응답 복원), restoreParams(헤더/바디 복원)
- `HTTPClientTests`: TLS bypass delegate 동작
- `ViewBodyTests`: HistoryRow body, 즐겨찾기 섹션 body
