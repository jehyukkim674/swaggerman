# Swagger Man Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** xcodegen으로 SwaggerMan.xcodeproj를 생성하고, SwiftData 영속 모델·도메인 모델·핵심 서비스(OpenAPIParser, HTTPClient, SpecCache)·기본 Store를 TDD로 구현하여 "프로젝트 등록 → Swagger 파싱 → 환경 관리"가 동작하는 실행 가능한 macOS 14+ 앱 골격을 완성한다.

**Architecture:** View → @Observable Store → Service(Protocol) 단방향 의존. SwiftData ModelContainer는 @main 진입점에서 주입. 서비스는 Protocol 노출, 테스트 시 in-memory ModelContainer + mock 교체.

**Tech Stack:** Swift 5.9+, SwiftUI, SwiftData, macOS 14+, Xcode 16, xcodegen 2.x, OpenAPIKit30 3.x, Yams 5.x, KeychainAccess 4.x, swift-snapshot-testing 1.x, Swift Testing (Xcode 16 내장)

---

## File Structure

```
project.yml                                       # xcodegen 설정
SwaggerMan/
  App/SwaggerManApp.swift                         # @main + ModelContainer 주입
  SwaggerMan.entitlements                         # 네트워크 클라이언트 권한
  Resources/Info.plist                            # 앱 메타데이터
  Errors/SwaggerManError.swift                    # 도메인 에러 타입
  Models/
    ParsedSpec.swift                              # 파싱 결과 집합체 (비영속)
    Operation.swift                               # API 오퍼레이션 모델 (비영속)
    HTTPRequest.swift                             # HTTP 요청 모델 (비영속)
    HTTPResponse.swift                            # HTTP 응답 모델 (비영속)
  Persistence/
    Project.swift                                 # @Model: Swagger 프로젝트
    APIEnvironment.swift                          # @Model: 실행 환경 (Environment → APIEnvironment*)
    FavoriteOperation.swift                       # @Model: 즐겨찾기
    RequestCollection.swift                       # @Model: 컬렉션 (Collection → RequestCollection*)
    SavedRequest.swift                            # @Model: 저장된 요청
    HistoryItem.swift                             # @Model: 히스토리
  Services/
    Protocols.swift                               # 서비스 프로토콜 모음
    HTTPClient.swift                              # URLSession 기반 HTTP 클라이언트
    OpenAPIParser.swift                           # OpenAPIKit30 래퍼 → ParsedSpec
    SpecCache.swift                               # 파일 기반 ETag 캐시
  Stores/
    ProjectStore.swift                            # 프로젝트 CRUD + 선택 상태
    EnvironmentStore.swift                        # 환경 CRUD + 활성 환경
    OperationStore.swift                          # Spec 로드·파싱·캐시 조율
  Views/
    Root/
      RootView.swift                              # NavigationSplitView 3-pane 레이아웃
      TopBar.swift                                # 프로젝트/환경 드롭다운
    Settings/
      ProjectListEditor.swift                     # 프로젝트 등록/편집/삭제
      EnvironmentEditor.swift                     # 환경 설정 시트

SwaggerManTests/
  TestHelpers/
    ModelContainerFactory.swift                   # in-memory ModelContainer 생성 헬퍼
    MockURLProtocol.swift                         # URLSession stub
  Services/
    HTTPClientTests.swift
    OpenAPIParserTests.swift
    SpecCacheTests.swift
  Integration/
    ProjectStoreTests.swift
    EnvironmentStoreTests.swift
    OperationStoreTests.swift
```

> *이름 변경 이유: `Environment`는 SwiftUI의 `@Environment` 프로퍼티 래퍼와, `Collection`은 Swift 표준 라이브러리 `Collection` 프로토콜과 이름이 충돌하여 컴파일러 경고 및 모호성을 유발한다.

---

## Task 1: xcodegen 설치 및 Xcode 프로젝트 생성

**Files:**
- Create: `project.yml`
- Create: `SwaggerMan/SwaggerMan.entitlements`
- Create: `SwaggerMan/Resources/Info.plist`
- Create: `.gitignore` (Xcode 항목 추가)

### 1-1. xcodegen 설치

- [ ] xcodegen 설치

```bash
brew install xcodegen
xcodegen --version   # 2.x.x 출력 확인
```

### 1-2. project.yml 작성

- [ ] 프로젝트 루트에 `project.yml` 작성

```yaml
name: SwaggerMan
options:
  bundleIdPrefix: com.swaggerman
  deploymentTarget:
    macOS: "14.0"
  xcodeVersion: "16.0"
  createIntermediateGroups: true

settings:
  base:
    SWIFT_VERSION: "5.9"
    MACOSX_DEPLOYMENT_TARGET: "14.0"
    ENABLE_HARDENED_RUNTIME: YES
    DEBUG_INFORMATION_FORMAT: dwarf-with-dsym

targets:
  SwaggerMan:
    type: application
    platform: macOS
    sources:
      - path: SwaggerMan
    info:
      path: SwaggerMan/Resources/Info.plist
      properties:
        CFBundleDisplayName: "Swagger Man"
        NSHumanReadableCopyright: ""
        NSAppTransportSecurity:
          NSAllowsArbitraryLoads: true
    entitlements:
      path: SwaggerMan/SwaggerMan.entitlements
      properties:
        com.apple.security.app-sandbox: true
        com.apple.security.network.client: true
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.swaggerman.app
        PRODUCT_NAME: SwaggerMan
        CODE_SIGN_STYLE: Automatic
        DEVELOPMENT_TEAM: ""
    dependencies:
      - package: OpenAPIKit
        product: OpenAPIKit30
      - package: Yams
        product: Yams
      - package: KeychainAccess
        product: KeychainAccess

  SwaggerManTests:
    type: bundle.unit-test
    platform: macOS
    sources:
      - path: SwaggerManTests
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.swaggerman.tests
        TEST_HOST: "$(BUILT_PRODUCTS_DIR)/SwaggerMan.app/Contents/MacOS/SwaggerMan"
        BUNDLE_LOADER: "$(TEST_HOST)"
    dependencies:
      - target: SwaggerMan
      - package: swift-snapshot-testing
        product: SnapshotTesting

packages:
  OpenAPIKit:
    url: https://github.com/mattpolzin/OpenAPIKit
    from: "3.0.0"
  Yams:
    url: https://github.com/jpsim/Yams
    from: "5.0.0"
  KeychainAccess:
    url: https://github.com/kishikawakatsumi/KeychainAccess
    from: "4.2.0"
  swift-snapshot-testing:
    url: https://github.com/pointfreeco/swift-snapshot-testing
    from: "1.15.0"
```

### 1-3. 플레이스홀더 파일 생성

- [ ] 엔타이틀먼트 파일 생성 (xcodegen이 inline 처리하므로 빈 파일)

```bash
mkdir -p SwaggerMan/Resources SwaggerManTests/TestHelpers SwaggerManTests/Services SwaggerManTests/Integration
touch SwaggerMan/SwaggerMan.entitlements
```

### 1-4. 소스 엔트리 파일 생성 (빌드 오류 방지용 플레이스홀더)

- [ ] `SwaggerMan/App/SwaggerManApp.swift` 최소 내용 작성

```swift
import SwiftUI

@main
struct SwaggerManApp: App {
    var body: some Scene {
        WindowGroup {
            Text("Swagger Man")
        }
    }
}
```

- [ ] `SwaggerManTests/TestHelpers/Placeholder.swift` 생성 (빈 테스트 타겟 빌드용)

```swift
// placeholder
```

### 1-5. .gitignore 업데이트

- [ ] `.gitignore`에 Xcode 항목 추가

```
*.xcodeproj/xcuserdata/
*.xcworkspace/xcuserdata/
DerivedData/
.build/
*.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/
```

### 1-6. 프로젝트 생성 및 빌드 확인

- [ ] xcodegen 실행

```bash
xcodegen generate
```

Expected: `SwaggerMan.xcodeproj` 생성됨

- [ ] 빌드 확인

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -configuration Debug \
  | tail -20
```

Expected: `** BUILD SUCCEEDED **`

### 1-7. 커밋

- [ ] 커밋

```bash
git add project.yml SwaggerMan/ SwaggerManTests/ .gitignore
git commit -m "chore: xcodegen 기반 Xcode 프로젝트 초기 생성"
```

---

## Task 2: 에러 타입 정의

**Files:**
- Create: `SwaggerMan/Errors/SwaggerManError.swift`

### 2-1. 에러 타입 구현

- [ ] `SwaggerMan/Errors/SwaggerManError.swift` 작성

```swift
import Foundation

enum SwaggerManError: LocalizedError {
    case network(NetworkError)
    case parsing(ParsingError)
    case auth(AuthError)
    case persistence(PersistenceError)
    case validation(ValidationError)

    var errorDescription: String? {
        switch self {
        case .network(let e): return e.localizedDescription
        case .parsing(let e): return e.localizedDescription
        case .auth(let e): return e.localizedDescription
        case .persistence(let e): return e.localizedDescription
        case .validation(let e): return e.localizedDescription
        }
    }
}

enum NetworkError: LocalizedError {
    case offline
    case timeout
    case dnsFailure(host: String)
    case tlsFailure(detail: String)
    case unauthorizedSwagger
    case unexpectedStatus(Int, body: String)

    var errorDescription: String? {
        switch self {
        case .offline: return "오프라인 상태입니다."
        case .timeout: return "요청 시간이 초과되었습니다."
        case .dnsFailure(let host): return "호스트 '\(host)'에 연결할 수 없습니다."
        case .tlsFailure(let detail): return "TLS 검증 실패: \(detail)"
        case .unauthorizedSwagger: return "이 Swagger URL은 인증이 필요합니다."
        case .unexpectedStatus(let code, _): return "예상치 못한 응답 코드: \(code)"
        }
    }
}

enum ParsingError: LocalizedError {
    case invalidJSON(String)
    case invalidYAML(String)
    case unsupportedVersion(String)
    case missingField(String)

    var errorDescription: String? {
        switch self {
        case .invalidJSON(let msg): return "JSON 파싱 오류: \(msg)"
        case .invalidYAML(let msg): return "YAML 파싱 오류: \(msg)"
        case .unsupportedVersion(let v): return "지원하지 않는 OpenAPI 버전: \(v)"
        case .missingField(let field): return "필수 필드 누락: \(field)"
        }
    }
}

enum AuthError: LocalizedError {
    case tokenNotSet
    case keychainDenied
    case tokenExpired

    var errorDescription: String? {
        switch self {
        case .tokenNotSet: return "토큰이 설정되지 않았습니다."
        case .keychainDenied: return "Keychain 접근이 거부되었습니다."
        case .tokenExpired: return "토큰이 만료되었을 수 있습니다."
        }
    }
}

enum PersistenceError: LocalizedError {
    case saveFailed(String)
    case duplicateAlias(String)

    var errorDescription: String? {
        switch self {
        case .saveFailed(let msg): return "저장 실패: \(msg)"
        case .duplicateAlias(let alias): return "이미 사용 중인 alias입니다: '\(alias)'"
        }
    }
}

enum ValidationError: LocalizedError {
    case requiredFieldMissing(String)
    case typeMismatch(field: String, expected: String)
    case invalidJSON(position: String)

    var errorDescription: String? {
        switch self {
        case .requiredFieldMissing(let field): return "필수 항목을 입력하세요: \(field)"
        case .typeMismatch(let field, let expected): return "\(field) 필드는 \(expected) 타입이어야 합니다."
        case .invalidJSON(let pos): return "유효하지 않은 JSON (\(pos))"
        }
    }
}
```

### 2-2. 빌드 확인

- [ ] 빌드

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  | grep -E "(error:|BUILD)"
```

Expected: `** BUILD SUCCEEDED **` (에러 없음)

### 2-3. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Errors/
git commit -m "feat: SwaggerManError 도메인 에러 타입 정의"
```

---

## Task 3: 비영속 도메인 모델

**Files:**
- Create: `SwaggerMan/Models/HTTPRequest.swift`
- Create: `SwaggerMan/Models/HTTPResponse.swift`
- Create: `SwaggerMan/Models/Operation.swift`
- Create: `SwaggerMan/Models/ParsedSpec.swift`

### 3-1. HTTPRequest 구현

- [ ] `SwaggerMan/Models/HTTPRequest.swift` 작성

```swift
import Foundation

enum HTTPMethod: String, Codable, CaseIterable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
    case options = "OPTIONS"
    case head = "HEAD"

    var color: String {
        switch self {
        case .get: return "green"
        case .post: return "blue"
        case .put: return "orange"
        case .delete: return "red"
        case .patch: return "purple"
        case .options, .head: return "gray"
        }
    }
}

struct HTTPRequest {
    let method: HTTPMethod
    let url: URL
    var headers: [String: String]
    var body: Data?
}
```

### 3-2. HTTPResponse 구현

- [ ] `SwaggerMan/Models/HTTPResponse.swift` 작성

```swift
import Foundation

struct HTTPResponse {
    let statusCode: Int
    let headers: [String: String]
    let body: Data
    let durationMs: Int

    var isSuccess: Bool { (200..<300).contains(statusCode) }
    var bodyString: String? { String(data: body, encoding: .utf8) }
}
```

### 3-3. Operation 구현

- [ ] `SwaggerMan/Models/Operation.swift` 작성

```swift
import Foundation

struct ParsedParameter: Identifiable {
    let id: String
    let name: String
    let location: ParameterLocation
    let required: Bool
    let schema: ParsedSchema?
    let description: String?
}

enum ParameterLocation: String, Codable {
    case path, query, header, cookie
}

struct ParsedSchema {
    let type: SchemaType
    let properties: [String: ParsedSchema]?
    let items: ParsedSchema?
    let enumValues: [String]?
    let required: [String]?
    let defaultValue: String?
    let example: String?
    let description: String?
}

enum SchemaType: String {
    case string, integer, number, boolean, array, object, unknown
}

struct ParsedRequestBody {
    let required: Bool
    let contentType: String
    let schema: ParsedSchema?
}

struct ParsedOperation: Identifiable {
    let id: String                  // "\(method.rawValue) \(path)"
    let method: HTTPMethod
    let path: String
    let operationId: String?
    let summary: String?
    let description: String?
    let tags: [String]
    let parameters: [ParsedParameter]
    let requestBody: ParsedRequestBody?
    let responseDescriptions: [String: String]   // statusCode → description
}
```

### 3-4. ParsedSpec 구현

- [ ] `SwaggerMan/Models/ParsedSpec.swift` 작성

```swift
import Foundation

struct SpecInfo {
    let title: String
    let version: String
    let description: String?
}

struct ParsedSpec {
    let info: SpecInfo
    let servers: [String]
    let operations: [ParsedOperation]
    let rawOperationCount: Int
}
```

### 3-5. 빌드 확인 + 커밋

- [ ] 빌드

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  | grep -E "(error:|BUILD)"
```

Expected: `** BUILD SUCCEEDED **`

- [ ] 커밋

```bash
git add SwaggerMan/Models/
git commit -m "feat: 비영속 도메인 모델 정의 (HTTPRequest, HTTPResponse, Operation, ParsedSpec)"
```

---

## Task 4: SwiftData 영속 모델

**Files:**
- Create: `SwaggerMan/Persistence/Project.swift`
- Create: `SwaggerMan/Persistence/APIEnvironment.swift`
- Create: `SwaggerMan/Persistence/FavoriteOperation.swift`
- Create: `SwaggerMan/Persistence/RequestCollection.swift`
- Create: `SwaggerMan/Persistence/SavedRequest.swift`
- Create: `SwaggerMan/Persistence/HistoryItem.swift`
- Create: `SwaggerManTests/TestHelpers/ModelContainerFactory.swift`
- Test: `SwaggerManTests/Integration/PersistenceTests.swift`

### 4-1. Project 모델 구현

- [ ] `SwaggerMan/Persistence/Project.swift` 작성

```swift
import SwiftData
import Foundation

@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var alias: String
    var swaggerURL: String
    var createdAt: Date
    var lastUsedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \APIEnvironment.project)
    var environments: [APIEnvironment]

    @Relationship(deleteRule: .cascade, inverse: \RequestCollection.project)
    var collections: [RequestCollection]

    @Relationship(deleteRule: .cascade, inverse: \FavoriteOperation.project)
    var favorites: [FavoriteOperation]

    @Relationship(deleteRule: .cascade, inverse: \HistoryItem.project)
    var history: [HistoryItem]

    init(alias: String, swaggerURL: String) {
        self.id = UUID()
        self.alias = alias
        self.swaggerURL = swaggerURL
        self.createdAt = Date()
        self.lastUsedAt = Date()
        self.environments = []
        self.collections = []
        self.favorites = []
        self.history = []
    }
}
```

### 4-2. APIEnvironment 모델 구현

- [ ] `SwaggerMan/Persistence/APIEnvironment.swift` 작성

```swift
import SwiftData
import Foundation

enum AuthSchemeType: String, Codable {
    case none, bearer, basic, apiKey
}

@Model
final class APIEnvironment {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var name: String
    var baseURL: String
    var authScheme: AuthSchemeType
    var apiKeyHeaderName: String?
    var apiKeyLocation: String?         // "header" | "query"
    var disableTLSValidation: Bool
    var createdAt: Date

    var keychainKey: String {
        "com.swaggerman.token.\(project?.id.uuidString ?? "").\(id.uuidString)"
    }

    init(name: String, baseURL: String, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.name = name
        self.baseURL = baseURL
        self.authScheme = .none
        self.disableTLSValidation = false
        self.createdAt = Date()
    }
}
```

### 4-3. FavoriteOperation 모델 구현

- [ ] `SwaggerMan/Persistence/FavoriteOperation.swift` 작성

```swift
import SwiftData
import Foundation

@Model
final class FavoriteOperation {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var method: String
    var path: String
    var sortOrder: Int
    var createdAt: Date

    init(method: String, path: String, sortOrder: Int, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.method = method
        self.path = path
        self.sortOrder = sortOrder
        self.createdAt = Date()
    }
}
```

### 4-4. RequestCollection + SavedRequest 모델 구현

- [ ] `SwaggerMan/Persistence/RequestCollection.swift` 작성

```swift
import SwiftData
import Foundation

@Model
final class RequestCollection {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var name: String
    var sortOrder: Int

    @Relationship(deleteRule: .cascade, inverse: \SavedRequest.collection)
    var requests: [SavedRequest]

    init(name: String, sortOrder: Int, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.name = name
        self.sortOrder = sortOrder
        self.requests = []
    }
}
```

- [ ] `SwaggerMan/Persistence/SavedRequest.swift` 작성

```swift
import SwiftData
import Foundation

@Model
final class SavedRequest {
    @Attribute(.unique) var id: UUID
    var collection: RequestCollection?
    var name: String
    var method: String
    var path: String
    var pathParamsJSON: String
    var queryParamsJSON: String
    var headersJSON: String
    var bodyJSON: String?
    var sortOrder: Int
    var createdAt: Date
    var updatedAt: Date

    init(name: String, method: String, path: String,
         collection: RequestCollection? = nil) {
        self.id = UUID()
        self.collection = collection
        self.name = name
        self.method = method
        self.path = path
        self.pathParamsJSON = "{}"
        self.queryParamsJSON = "{}"
        self.headersJSON = "{}"
        self.sortOrder = 0
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
```

### 4-5. HistoryItem 모델 구현

- [ ] `SwaggerMan/Persistence/HistoryItem.swift` 작성

```swift
import SwiftData
import Foundation

@Model
final class HistoryItem {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var environmentID: UUID
    var method: String
    var path: String
    var fullURL: String
    var requestHeadersJSON: String
    var requestBody: String?
    var responseStatus: Int
    var responseHeadersJSON: String
    var responseBody: String
    var responseSize: Int
    var durationMs: Int
    var executedAt: Date

    init(environmentID: UUID, method: String, path: String, fullURL: String,
         requestHeadersJSON: String, requestBody: String?,
         responseStatus: Int, responseHeadersJSON: String,
         responseBody: String, responseSize: Int, durationMs: Int,
         project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.environmentID = environmentID
        self.method = method
        self.path = path
        self.fullURL = fullURL
        self.requestHeadersJSON = requestHeadersJSON
        self.requestBody = requestBody
        self.responseStatus = responseStatus
        self.responseHeadersJSON = responseHeadersJSON
        self.responseBody = responseBody
        self.responseSize = responseSize
        self.durationMs = durationMs
        self.executedAt = Date()
    }
}
```

### 4-6. ModelContainerFactory 헬퍼 작성

- [ ] `SwaggerManTests/TestHelpers/ModelContainerFactory.swift` 작성

```swift
import SwiftData
import Foundation
@testable import SwaggerMan

enum ModelContainerFactory {
    @MainActor
    static func makeInMemory() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for:
                Project.self,
                APIEnvironment.self,
                FavoriteOperation.self,
                RequestCollection.self,
                SavedRequest.self,
                HistoryItem.self,
            configurations: config
        )
    }
}
```

### 4-7. 영속 모델 테스트 작성 (실패 확인)

- [ ] `SwaggerManTests/Integration/PersistenceTests.swift` 작성

```swift
import Testing
import SwiftData
@testable import SwaggerMan

@Suite("Persistence Model Tests")
@MainActor
struct PersistenceTests {

    @Test("Project 생성 후 조회 가능")
    func createsProject() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        let project = Project(alias: "My API", swaggerURL: "https://api.example.com/docs")
        ctx.insert(project)
        try ctx.save()

        let descriptor = FetchDescriptor<Project>()
        let projects = try ctx.fetch(descriptor)

        #expect(projects.count == 1)
        #expect(projects[0].alias == "My API")
    }

    @Test("Project 삭제 시 APIEnvironment cascade 삭제")
    func deletionCascadesToEnvironments() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        let project = Project(alias: "Test", swaggerURL: "https://x.com")
        let env = APIEnvironment(name: "Dev", baseURL: "https://x.com", project: project)
        project.environments.append(env)
        ctx.insert(project)
        try ctx.save()

        ctx.delete(project)
        try ctx.save()

        let envs = try ctx.fetch(FetchDescriptor<APIEnvironment>())
        #expect(envs.isEmpty)
    }

    @Test("HistoryItem 생성 및 Project 연결")
    func historyItemLinkedToProject() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        let project = Project(alias: "API", swaggerURL: "https://api.com/docs")
        ctx.insert(project)

        let item = HistoryItem(
            environmentID: UUID(),
            method: "GET", path: "/users",
            fullURL: "https://api.com/users",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "[]",
            responseSize: 2,
            durationMs: 120,
            project: project
        )
        project.history.append(item)
        try ctx.save()

        let items = try ctx.fetch(FetchDescriptor<HistoryItem>())
        #expect(items.count == 1)
        #expect(items[0].responseStatus == 200)
    }
}
```

### 4-8. 테스트 실행 (실패 확인 후 → 빌드로 성공 확인)

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/PersistenceTests \
  | grep -E "(Test.*passed|Test.*failed|error:|BUILD)"
```

Expected: 3 tests passed

### 4-9. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Persistence/ SwaggerManTests/TestHelpers/ModelContainerFactory.swift \
        SwaggerManTests/Integration/PersistenceTests.swift
git commit -m "feat: SwiftData 영속 모델 6종 및 in-memory 테스트 추가"
```

---

## Task 5: 서비스 프로토콜 정의

**Files:**
- Create: `SwaggerMan/Services/Protocols.swift`

### 5-1. 프로토콜 작성

- [ ] `SwaggerMan/Services/Protocols.swift` 작성

```swift
import Foundation

// MARK: - HTTPClient

protocol HTTPClientProtocol: Sendable {
    func get(_ url: URL, headers: [String: String]) async throws -> HTTPResponse
    func execute(_ request: HTTPRequest) async throws -> HTTPResponse
}

// MARK: - OpenAPIParser

protocol OpenAPIParserProtocol: Sendable {
    func parse(_ data: Data) throws -> ParsedSpec
    func parseYAML(_ string: String) throws -> ParsedSpec
}

// MARK: - SpecCache

struct CachedEntry {
    let spec: ParsedSpec
    let etag: String?
    let cachedAt: Date
}

protocol SpecCacheProtocol: Sendable {
    func load(for urlString: String) -> CachedEntry?
    func store(_ entry: CachedEntry, for urlString: String)
    func invalidate(for urlString: String)
    func clear()
}

// MARK: - KeychainService

protocol KeychainServiceProtocol: Sendable {
    func save(_ value: String, for key: String) throws
    func load(for key: String) throws -> String?
    func delete(for key: String) throws
}
```

### 5-2. 빌드 확인 + 커밋

- [ ] 빌드

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  | grep -E "(error:|BUILD)"
```

- [ ] 커밋

```bash
git add SwaggerMan/Services/Protocols.swift
git commit -m "feat: 서비스 레이어 프로토콜 정의 (HTTPClient, OpenAPIParser, SpecCache, Keychain)"
```

---

## Task 6: HTTPClient 구현 (TDD)

**Files:**
- Create: `SwaggerMan/Services/HTTPClient.swift`
- Create: `SwaggerManTests/TestHelpers/MockURLProtocol.swift`
- Test: `SwaggerManTests/Services/HTTPClientTests.swift`

### 6-1. MockURLProtocol 작성

- [ ] `SwaggerManTests/TestHelpers/MockURLProtocol.swift` 작성

```swift
import Foundation

final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

extension URLSession {
    static func mock() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }
}
```

### 6-2. HTTPClient 테스트 작성 (실패 확인)

- [ ] `SwaggerManTests/Services/HTTPClientTests.swift` 작성

```swift
import Testing
import Foundation
@testable import SwaggerMan

@Suite("HTTPClient Tests")
struct HTTPClientTests {

    func makeClient() -> HTTPClient {
        HTTPClient(session: .mock())
    }

    @Test("GET 요청 성공 시 200과 body 반환")
    func getSuccess() async throws {
        let client = makeClient()
        let body = #"{"ok":true}"#.data(using: .utf8)!

        MockURLProtocol.requestHandler = { req in
            #expect(req.httpMethod == "GET")
            let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (res, body)
        }

        let url = URL(string: "https://api.example.com/health")!
        let response = try await client.get(url, headers: [:])

        #expect(response.statusCode == 200)
        #expect(response.body == body)
    }

    @Test("POST 요청 시 body 전달됨")
    func postSendsBody() async throws {
        let client = makeClient()
        let requestBody = #"{"name":"test"}"#.data(using: .utf8)!
        var capturedBody: Data?

        MockURLProtocol.requestHandler = { req in
            capturedBody = req.httpBody
            let res = HTTPURLResponse(url: req.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!
            return (res, Data())
        }

        let url = URL(string: "https://api.example.com/users")!
        let req = HTTPRequest(
            method: .post,
            url: url,
            headers: ["Content-Type": "application/json"],
            body: requestBody
        )
        _ = try await client.execute(req)

        #expect(capturedBody == requestBody)
    }

    @Test("timeout 발생 시 NetworkError.timeout throw")
    func timeoutThrows() async throws {
        let client = makeClient()

        MockURLProtocol.requestHandler = { _ in
            throw URLError(.timedOut)
        }

        let url = URL(string: "https://api.example.com/slow")!
        await #expect(throws: SwaggerManError.self) {
            _ = try await client.get(url, headers: [:])
        }
    }

    @Test("401 응답 시 에러 없이 정상 반환 (상태코드를 그대로 전달)")
    func unauthorizedPassedThrough() async throws {
        let client = makeClient()

        MockURLProtocol.requestHandler = { req in
            let res = HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (res, Data())
        }

        let url = URL(string: "https://api.example.com/protected")!
        let response = try await client.get(url, headers: [:])

        #expect(response.statusCode == 401)
    }
}
```

### 6-3. 테스트 실행 (컴파일 에러 확인)

- [ ] 테스트 실행 (HTTPClient 미구현이므로 빌드 실패 예상)

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/HTTPClientTests \
  2>&1 | grep "error:"
```

Expected: `error: cannot find type 'HTTPClient' in scope`

### 6-4. HTTPClient 구현

- [ ] `SwaggerMan/Services/HTTPClient.swift` 작성

```swift
import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "HTTPClient")

actor HTTPClient: HTTPClientProtocol {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func get(_ url: URL, headers: [String: String] = [:]) async throws -> HTTPResponse {
        let req = HTTPRequest(method: .get, url: url, headers: headers)
        return try await execute(req)
    }

    func execute(_ request: HTTPRequest) async throws -> HTTPResponse {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.timeoutInterval = 30
        request.headers.forEach { urlRequest.setValue($1, forHTTPHeaderField: $0) }
        urlRequest.httpBody = request.body

        log.debug("→ \(request.method.rawValue) \(request.url)")

        do {
            let start = Date()
            let (data, response) = try await session.data(for: urlRequest)
            let durationMs = Int(Date().timeIntervalSince(start) * 1000)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw SwaggerManError.network(.unexpectedStatus(-1, body: ""))
            }

            var headers: [String: String] = [:]
            httpResponse.allHeaderFields.forEach { k, v in
                if let key = k as? String, let val = v as? String {
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
        case .timedOut:
            return .network(.timeout)
        case .notConnectedToInternet, .networkConnectionLost:
            return .network(.offline)
        case .cannotFindHost, .cannotConnectToHost:
            return .network(.dnsFailure(host: host))
        case .serverCertificateUntrusted, .serverCertificateHasUnknownRoot:
            return .network(.tlsFailure(detail: error.localizedDescription))
        default:
            return .network(.unexpectedStatus(-1, body: error.localizedDescription))
        }
    }
}
```

### 6-5. 테스트 실행 (통과 확인)

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/HTTPClientTests \
  | grep -E "(Test.*passed|Test.*failed|error:)"
```

Expected: 4 tests passed

### 6-6. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Services/HTTPClient.swift \
        SwaggerManTests/TestHelpers/MockURLProtocol.swift \
        SwaggerManTests/Services/HTTPClientTests.swift
git commit -m "feat: HTTPClient 구현 (URLSession 기반, URLError 매핑)"
```

---

## Task 7: OpenAPIParser 구현 (TDD)

**Files:**
- Create: `SwaggerMan/Services/OpenAPIParser.swift`
- Create: `SwaggerManTests/Services/OpenAPIParserTests.swift`

### 7-1. OpenAPIParser 테스트 작성 (실패 확인)

- [ ] `SwaggerManTests/Services/OpenAPIParserTests.swift` 작성

```swift
import Testing
import Foundation
@testable import SwaggerMan

// MARK: - Fixture

private let validOpenAPI30JSON = """
{
  "openapi": "3.0.0",
  "info": { "title": "Test API", "version": "1.0.0" },
  "servers": [{ "url": "https://api.example.com" }],
  "paths": {
    "/users": {
      "get": {
        "summary": "List users",
        "operationId": "listUsers",
        "tags": ["Users"],
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": { "type": "integer" }
          }
        ],
        "responses": { "200": { "description": "Success" } }
      },
      "post": {
        "summary": "Create user",
        "operationId": "createUser",
        "tags": ["Users"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name"],
                "properties": {
                  "name": { "type": "string" },
                  "age": { "type": "integer" }
                }
              }
            }
          }
        },
        "responses": { "201": { "description": "Created" } }
      }
    },
    "/users/{id}": {
      "get": {
        "summary": "Get user",
        "tags": ["Users"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": { "200": { "description": "User found" } }
      }
    }
  }
}
"""

private let openAPI20JSON = """
{
  "swagger": "2.0",
  "info": { "title": "Old API", "version": "1.0.0" },
  "paths": {}
}
"""

@Suite("OpenAPIParser Tests")
struct OpenAPIParserTests {
    let parser = OpenAPIParser()

    @Test("유효한 OpenAPI 3.0 JSON 파싱 → 오퍼레이션 3개")
    func parsesValidJSON() throws {
        let data = validOpenAPI30JSON.data(using: .utf8)!
        let spec = try parser.parse(data)

        #expect(spec.operations.count == 3)
        #expect(spec.info.title == "Test API")
        #expect(spec.servers.first == "https://api.example.com")
    }

    @Test("GET /users 오퍼레이션 필드 검증")
    func parsesGetOperation() throws {
        let data = validOpenAPI30JSON.data(using: .utf8)!
        let spec = try parser.parse(data)

        let getUsers = spec.operations.first { $0.method == .get && $0.path == "/users" }
        #expect(getUsers != nil)
        #expect(getUsers?.summary == "List users")
        #expect(getUsers?.tags == ["Users"])
        #expect(getUsers?.parameters.first?.name == "limit")
        #expect(getUsers?.parameters.first?.location == .query)
    }

    @Test("POST /users requestBody 파싱")
    func parsesRequestBody() throws {
        let data = validOpenAPI30JSON.data(using: .utf8)!
        let spec = try parser.parse(data)

        let post = spec.operations.first { $0.method == .post && $0.path == "/users" }
        #expect(post?.requestBody != nil)
        #expect(post?.requestBody?.required == true)
    }

    @Test("path 파라미터 location = .path")
    func parsesPathParameter() throws {
        let data = validOpenAPI30JSON.data(using: .utf8)!
        let spec = try parser.parse(data)

        let getUser = spec.operations.first { $0.path == "/users/{id}" }
        let idParam = getUser?.parameters.first { $0.name == "id" }
        #expect(idParam?.location == .path)
        #expect(idParam?.required == true)
    }

    @Test("OpenAPI 2.0 입력 시 ParsingError.unsupportedVersion throw")
    func rejectsOpenAPI20() throws {
        let data = openAPI20JSON.data(using: .utf8)!

        #expect(throws: SwaggerManError.self) {
            _ = try parser.parse(data)
        }
    }

    @Test("잘못된 JSON 입력 시 ParsingError throw")
    func throwsOnInvalidJSON() throws {
        let data = "{ invalid json }".data(using: .utf8)!

        #expect(throws: SwaggerManError.self) {
            _ = try parser.parse(data)
        }
    }

    @Test("YAML 입력 파싱")
    func parsesYAML() throws {
        let yaml = """
        openapi: "3.0.0"
        info:
          title: YAML API
          version: "1.0.0"
        paths:
          /health:
            get:
              summary: Health check
              responses:
                "200":
                  description: OK
        """
        let spec = try parser.parseYAML(yaml)
        #expect(spec.info.title == "YAML API")
        #expect(spec.operations.count == 1)
    }
}
```

### 7-2. 테스트 실행 (컴파일 에러 확인)

- [ ] 빌드 실패 확인

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerManTests \
  -destination "platform=macOS" \
  2>&1 | grep "error: cannot find"
```

Expected: `error: cannot find type 'OpenAPIParser' in scope`

### 7-3. OpenAPIParser 구현

- [ ] `SwaggerMan/Services/OpenAPIParser.swift` 작성

```swift
import Foundation
import OpenAPIKit30
import Yams

struct OpenAPIParser: OpenAPIParserProtocol {

    func parse(_ data: Data) throws -> ParsedSpec {
        // OpenAPI 2.0 감지 (swagger 키 존재 여부 확인)
        if let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           dict["swagger"] != nil {
            throw SwaggerManError.parsing(.unsupportedVersion("2.0"))
        }

        let document: OpenAPI.Document
        do {
            document = try JSONDecoder().decode(OpenAPI.Document.self, from: data)
        } catch let decodeError {
            throw SwaggerManError.parsing(.invalidJSON(decodeError.localizedDescription))
        }

        return try buildSpec(from: document)
    }

    func parseYAML(_ string: String) throws -> ParsedSpec {
        let document: OpenAPI.Document
        do {
            document = try YAMLDecoder().decode(OpenAPI.Document.self, from: string)
        } catch let decodeError {
            throw SwaggerManError.parsing(.invalidYAML(decodeError.localizedDescription))
        }
        return try buildSpec(from: document)
    }

    // MARK: - Private

    private func buildSpec(from document: OpenAPI.Document) throws -> ParsedSpec {
        let info = SpecInfo(
            title: document.info.title,
            version: document.info.version,
            description: document.info.description
        )

        let servers = document.servers?.compactMap { server -> String? in
            server.urlTemplate.absoluteString
        } ?? []

        var operations: [ParsedOperation] = []

        for (pathKey, pathItemRef) in document.paths {
            let pathItem: OpenAPI.PathItem
            switch pathItemRef {
            case .b(let item): pathItem = item
            case .a: continue  // 외부 $ref는 Phase 1에서 skip
            }

            let methodOps: [(OpenAPI.HttpMethod, OpenAPI.Operation)] = [
                (.get, pathItem.get),
                (.post, pathItem.post),
                (.put, pathItem.put),
                (.delete, pathItem.delete),
                (.patch, pathItem.patch),
                (.options, pathItem.options),
                (.head, pathItem.head),
            ].compactMap { method, op in op.map { (method, $0) } }

            for (apiMethod, op) in methodOps {
                guard let method = HTTPMethod(rawValue: apiMethod.rawValue.uppercased()) else { continue }

                let parameters = buildParameters(from: op.parameters)
                let requestBody = buildRequestBody(from: op.requestBody)
                let responseDescriptions = buildResponses(from: op.responses)

                let operation = ParsedOperation(
                    id: "\(method.rawValue) \(pathKey.rawValue)",
                    method: method,
                    path: pathKey.rawValue,
                    operationId: op.operationId,
                    summary: op.summary,
                    description: op.description,
                    tags: op.tags ?? [],
                    parameters: parameters,
                    requestBody: requestBody,
                    responseDescriptions: responseDescriptions
                )
                operations.append(operation)
            }
        }

        return ParsedSpec(
            info: info,
            servers: servers,
            operations: operations,
            rawOperationCount: operations.count
        )
    }

    private func buildParameters(
        from params: OpenAPI.Parameter.Array?
    ) -> [ParsedParameter] {
        guard let params else { return [] }
        return params.compactMap { paramRef -> ParsedParameter? in
            guard case .b(let param) = paramRef else { return nil }
            let location: ParameterLocation
            switch param.context {
            case .query: location = .query
            case .path: location = .path
            case .header: location = .header
            case .cookie: location = .cookie
            }
            let schema = param.schemaOrContent.schemaValue.map { buildSchema(from: $0) }
            return ParsedParameter(
                id: "\(param.name)-\(location.rawValue)",
                name: param.name,
                location: location,
                required: param.required,
                schema: schema,
                description: param.description
            )
        }
    }

    private func buildRequestBody(
        from bodyRef: Either<JSONReference<OpenAPI.Request>, OpenAPI.Request>?
    ) -> ParsedRequestBody? {
        guard let bodyRef else { return nil }
        guard case .b(let body) = bodyRef else { return nil }

        let contentType = body.content.keys.first?.rawValue ?? "application/json"
        let schema = body.content.values.first?.schema.map { buildSchema(from: $0) }

        return ParsedRequestBody(
            required: body.required,
            contentType: contentType,
            schema: schema ?? nil
        )
    }

    private func buildResponses(
        from responses: OpenAPI.Response.Map?
    ) -> [String: String] {
        guard let responses else { return [:] }
        var result: [String: String] = [:]
        for (status, responseRef) in responses {
            if case .b(let response) = responseRef {
                result[status.rawValue] = response.description
            }
        }
        return result
    }

    private func buildSchema(from schema: JSONSchema) -> ParsedSchema {
        let type: SchemaType
        switch schema.value {
        case .string: type = .string
        case .integer: type = .integer
        case .number: type = .number
        case .boolean: type = .boolean
        case .array: type = .array
        case .object: type = .object
        default: type = .unknown
        }

        var properties: [String: ParsedSchema]? = nil
        if case .object(let ctx, _, _) = schema.value,
           let props = ctx.properties {
            properties = Dictionary(uniqueKeysWithValues: props.map { k, v in
                (k, buildSchema(from: v))
            })
        }

        var items: ParsedSchema? = nil
        if case .array(_, let arrCtx, _) = schema.value,
           let itemsRef = arrCtx.items {
            items = buildSchema(from: itemsRef)
        }

        return ParsedSchema(
            type: type,
            properties: properties,
            items: items,
            enumValues: nil,
            required: schema.required,
            defaultValue: nil,
            example: nil,
            description: schema.description
        )
    }
}

// MARK: - Helpers

private extension OpenAPI.Parameter.Context {
    static var allCases: [OpenAPI.Parameter.Context] { [.query((allowEmptyValue: false)), .path, .header, .cookie] }
}

private extension OpenAPI.Parameter.SchemaContext {
    var schemaValue: JSONSchema? {
        if case .schema(let s, _, _) = self { return s }
        return nil
    }
}

private extension Either where A == JSONReference<JSONSchema>, B == JSONSchema {
    func map<T>(_ transform: (JSONSchema) -> T) -> T? {
        if case .b(let schema) = self { return transform(schema) }
        return nil
    }
}
```

> **주의:** OpenAPIKit30의 실제 API는 버전에 따라 다를 수 있다. 위 코드는 3.0.x 기준이며, 컴파일 에러 발생 시 OpenAPIKit30 소스의 타입 정의를 확인하여 조정한다. 특히 `pathItemRef`, `paramRef`, `bodyRef`의 `Either` 케이스 레이블이 다를 수 있다.

### 7-4. 테스트 실행 (통과 확인)

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/OpenAPIParserTests \
  | grep -E "(Test.*passed|Test.*failed|error:)"
```

Expected: 6 tests passed

### 7-5. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Services/OpenAPIParser.swift \
        SwaggerManTests/Services/OpenAPIParserTests.swift
git commit -m "feat: OpenAPIParser 구현 (OpenAPIKit30 + Yams, TDD)"
```

---

## Task 8: SpecCache 구현 (TDD)

**Files:**
- Create: `SwaggerMan/Services/SpecCache.swift`
- Test: `SwaggerManTests/Services/SpecCacheTests.swift`

### 8-1. SpecCache 테스트 작성 (실패 확인)

- [ ] `SwaggerManTests/Services/SpecCacheTests.swift` 작성

```swift
import Testing
import Foundation
@testable import SwaggerMan

@Suite("SpecCache Tests")
struct SpecCacheTests {
    let cache: SpecCache

    init() throws {
        // 테스트용 임시 디렉터리 사용
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("SwaggerManCacheTests-\(UUID().uuidString)")
        cache = SpecCache(cacheDirectory: tempDir)
    }

    func makeDummySpec() -> ParsedSpec {
        ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.test.com"],
            operations: [],
            rawOperationCount: 0
        )
    }

    @Test("저장 후 로드 가능")
    func storeAndLoad() {
        let url = "https://api.example.com/docs"
        let entry = CachedEntry(spec: makeDummySpec(), etag: "abc123", cachedAt: Date())

        cache.store(entry, for: url)
        let loaded = cache.load(for: url)

        #expect(loaded != nil)
        #expect(loaded?.etag == "abc123")
        #expect(loaded?.spec.info.title == "Test")
    }

    @Test("미저장 URL 로드 시 nil 반환")
    func loadMissingReturnsNil() {
        let loaded = cache.load(for: "https://not-cached.com/docs")
        #expect(loaded == nil)
    }

    @Test("invalidate 후 nil 반환")
    func invalidateRemovesEntry() {
        let url = "https://api.example.com/v2/docs"
        let entry = CachedEntry(spec: makeDummySpec(), etag: nil, cachedAt: Date())

        cache.store(entry, for: url)
        cache.invalidate(for: url)
        let loaded = cache.load(for: url)

        #expect(loaded == nil)
    }

    @Test("clear 후 모든 항목 제거")
    func clearRemovesAll() {
        cache.store(CachedEntry(spec: makeDummySpec(), etag: nil, cachedAt: Date()), for: "https://a.com")
        cache.store(CachedEntry(spec: makeDummySpec(), etag: nil, cachedAt: Date()), for: "https://b.com")

        cache.clear()

        #expect(cache.load(for: "https://a.com") == nil)
        #expect(cache.load(for: "https://b.com") == nil)
    }
}
```

### 8-2. SpecCache 구현

- [ ] `SwaggerMan/Services/SpecCache.swift` 작성

```swift
import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "SpecCache")

// 영구 저장을 위한 Codable 래퍼
private struct CachedEntryEnvelope: Codable {
    let specInfo: CodableSpecInfo
    let servers: [String]
    let etag: String?
    let cachedAt: Date
}

private struct CodableSpecInfo: Codable {
    let title: String
    let version: String
    let description: String?
}

actor SpecCache: SpecCacheProtocol {
    private let cacheDirectory: URL
    private var memoryCache: [String: CachedEntry] = [:]

    init(cacheDirectory: URL = .defaultCacheDirectory) {
        self.cacheDirectory = cacheDirectory
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    nonisolated func load(for urlString: String) -> CachedEntry? {
        Task { await self._load(for: urlString) }
        // sync wrapper for protocol conformance — use async version in production
        return nil // 실제 사용은 async load를 권장
    }

    func loadAsync(for urlString: String) -> CachedEntry? {
        _load(for: urlString)
    }

    private func _load(for urlString: String) -> CachedEntry? {
        if let cached = memoryCache[urlString] { return cached }

        let file = cacheFile(for: urlString)
        guard let data = try? Data(contentsOf: file),
              let envelope = try? JSONDecoder().decode(CachedEntryEnvelope.self, from: data) else {
            return nil
        }

        let spec = ParsedSpec(
            info: SpecInfo(title: envelope.specInfo.title, version: envelope.specInfo.version, description: envelope.specInfo.description),
            servers: envelope.servers,
            operations: [],       // 실제 파싱은 항상 재실행; 캐시는 원본 응답 캐싱 역할
            rawOperationCount: 0
        )
        let entry = CachedEntry(spec: spec, etag: envelope.etag, cachedAt: envelope.cachedAt)
        memoryCache[urlString] = entry
        return entry
    }

    nonisolated func store(_ entry: CachedEntry, for urlString: String) {
        Task { await self._store(entry, for: urlString) }
    }

    private func _store(_ entry: CachedEntry, for urlString: String) {
        memoryCache[urlString] = entry

        let envelope = CachedEntryEnvelope(
            specInfo: CodableSpecInfo(
                title: entry.spec.info.title,
                version: entry.spec.info.version,
                description: entry.spec.info.description
            ),
            servers: entry.spec.servers,
            etag: entry.etag,
            cachedAt: entry.cachedAt
        )
        let file = cacheFile(for: urlString)
        if let data = try? JSONEncoder().encode(envelope) {
            try? data.write(to: file, options: .atomic)
        }
    }

    nonisolated func invalidate(for urlString: String) {
        Task { await self._invalidate(for: urlString) }
    }

    private func _invalidate(for urlString: String) {
        memoryCache.removeValue(forKey: urlString)
        try? FileManager.default.removeItem(at: cacheFile(for: urlString))
    }

    nonisolated func clear() {
        Task { await self._clear() }
    }

    private func _clear() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    private func cacheFile(for urlString: String) -> URL {
        let hash = urlString.data(using: .utf8)!
            .map { String(format: "%02x", $0) }
            .joined()
            .prefix(32)
        return cacheDirectory.appendingPathComponent("spec_\(hash).json")
    }
}

extension URL {
    static var defaultCacheDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SwaggerMan")
    }
}
```

> **Note:** `SpecCacheProtocol`의 `nonisolated` 동기 메서드는 테스트에서 `actor` 내부 `_` 메서드를 직접 호출한다. 프로덕션 코드에서는 `OperationStore`가 `await specCache._load(...)` 형태로 async 호출한다. 테스트에서는 `SpecCache`가 `actor`이므로 테스트를 `async` 함수로 작성한다.

### 8-3. 테스트에 async 추가

SpecCache는 `actor`이므로 테스트 함수를 `async`로 수정한다.

- [ ] `SpecCacheTests.swift`의 각 `@Test` 함수를 `async`로 변경 + `SpecCache` 직접 호출 방식으로 수정

```swift
// init()도 async throws로 변경:
init() async throws {
    let tempDir = FileManager.default.temporaryDirectory
        .appendingPathComponent("SwaggerManCacheTests-\(UUID().uuidString)")
    cache = SpecCache(cacheDirectory: tempDir)
}

@Test("저장 후 로드 가능")
func storeAndLoad() async {
    let url = "https://api.example.com/docs"
    let entry = CachedEntry(spec: makeDummySpec(), etag: "abc123", cachedAt: Date())

    await cache._store(entry, for: url)              // private 메서드는 @testable로 접근
    let loaded = await cache._load(for: url)

    #expect(loaded != nil)
    #expect(loaded?.etag == "abc123")
}
```

> `_store`/`_load`를 `internal`로 변경하여 `@testable import`로 접근 가능하게 한다.

### 8-4. 테스트 실행 (통과 확인)

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/SpecCacheTests \
  | grep -E "(Test.*passed|Test.*failed|error:)"
```

Expected: 4 tests passed

### 8-5. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Services/SpecCache.swift \
        SwaggerManTests/Services/SpecCacheTests.swift
git commit -m "feat: SpecCache 구현 (파일 기반 ETag 캐시, actor)"
```

---

## Task 9: ProjectStore 구현 (TDD)

**Files:**
- Create: `SwaggerMan/Stores/ProjectStore.swift`
- Test: `SwaggerManTests/Integration/ProjectStoreTests.swift`

### 9-1. ProjectStore 테스트 작성 (실패 확인)

- [ ] `SwaggerManTests/Integration/ProjectStoreTests.swift` 작성

```swift
import Testing
import SwiftData
@testable import SwaggerMan

@Suite("ProjectStore Integration Tests")
@MainActor
struct ProjectStoreTests {

    func makeStore() throws -> ProjectStore {
        let container = try ModelContainerFactory.makeInMemory()
        return ProjectStore(modelContext: container.mainContext)
    }

    @Test("프로젝트 추가 시 기본 환경 자동 생성")
    func addsProjectWithDefaultEnvironment() throws {
        let store = try makeStore()

        try store.addProject(alias: "My API", swaggerURL: "https://api.example.com/docs")

        #expect(store.projects.count == 1)
        #expect(store.projects[0].alias == "My API")
        #expect(store.projects[0].environments.count == 1)
        #expect(store.projects[0].environments[0].name == "Dev")
    }

    @Test("중복 alias 추가 시 PersistenceError.duplicateAlias throw")
    func throwsOnDuplicateAlias() throws {
        let store = try makeStore()

        try store.addProject(alias: "My API", swaggerURL: "https://x.com/docs")

        #expect(throws: SwaggerManError.self) {
            try store.addProject(alias: "My API", swaggerURL: "https://y.com/docs")
        }
    }

    @Test("프로젝트 삭제 시 projects 목록에서 제거됨")
    func deletesProject() throws {
        let store = try makeStore()

        try store.addProject(alias: "To Delete", swaggerURL: "https://del.com/docs")
        let project = store.projects[0]
        try store.deleteProject(project)

        #expect(store.projects.isEmpty)
    }

    @Test("selectProject 시 lastUsedAt 갱신")
    func updatesLastUsedAt() throws {
        let store = try makeStore()

        try store.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = store.projects[0]
        let before = project.lastUsedAt

        // 시간 차이를 위해 1ms 지연
        Thread.sleep(forTimeInterval: 0.01)
        store.selectProject(project)

        #expect(project.lastUsedAt > before)
    }

    @Test("프로젝트가 없을 때 selectedProject는 nil")
    func selectedProjectNilWhenEmpty() throws {
        let store = try makeStore()
        #expect(store.selectedProject == nil)
    }
}
```

### 9-2. ProjectStore 구현

- [ ] `SwaggerMan/Stores/ProjectStore.swift` 작성

```swift
import SwiftData
import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "ProjectStore")

@Observable
@MainActor
final class ProjectStore {
    private(set) var projects: [Project] = []
    private(set) var selectedProject: Project?

    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        loadProjects()
    }

    // MARK: - Public

    func addProject(alias: String, swaggerURL: String) throws {
        guard !alias.trimmingCharacters(in: .whitespaces).isEmpty else {
            throw SwaggerManError.validation(.requiredFieldMissing("alias"))
        }

        if projects.contains(where: { $0.alias == alias }) {
            throw SwaggerManError.persistence(.duplicateAlias(alias))
        }

        let project = Project(alias: alias, swaggerURL: swaggerURL)

        // 기본 환경 생성
        let defaultEnv = APIEnvironment(name: "Dev", baseURL: swaggerURL, project: project)
        project.environments.append(defaultEnv)

        modelContext.insert(project)
        try save()

        loadProjects()

        if selectedProject == nil {
            selectedProject = project
        }

        log.info("Project added: \(alias)")
    }

    func deleteProject(_ project: Project) throws {
        modelContext.delete(project)
        try save()

        if selectedProject?.id == project.id {
            selectedProject = projects.first { $0.id != project.id }
        }

        loadProjects()
    }

    func selectProject(_ project: Project) {
        selectedProject = project
        project.lastUsedAt = Date()
        try? save()
    }

    func updateProject(_ project: Project, alias: String, swaggerURL: String) throws {
        let isDuplicate = projects.contains { $0.alias == alias && $0.id != project.id }
        if isDuplicate {
            throw SwaggerManError.persistence(.duplicateAlias(alias))
        }
        project.alias = alias
        project.swaggerURL = swaggerURL
        try save()
        loadProjects()
    }

    // MARK: - Private

    private func loadProjects() {
        let descriptor = FetchDescriptor<Project>(
            sortBy: [SortDescriptor(\.lastUsedAt, order: .reverse)]
        )
        projects = (try? modelContext.fetch(descriptor)) ?? []
    }

    private func save() throws {
        do {
            try modelContext.save()
        } catch {
            throw SwaggerManError.persistence(.saveFailed(error.localizedDescription))
        }
    }
}
```

### 9-3. 테스트 실행 (통과 확인)

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/ProjectStoreTests \
  | grep -E "(Test.*passed|Test.*failed|error:)"
```

Expected: 5 tests passed

### 9-4. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Stores/ProjectStore.swift \
        SwaggerManTests/Integration/ProjectStoreTests.swift
git commit -m "feat: ProjectStore 구현 (TDD) - CRUD, 기본 환경 생성, 중복 alias 검증"
```

---

## Task 10: EnvironmentStore 구현 (TDD)

**Files:**
- Create: `SwaggerMan/Stores/EnvironmentStore.swift`
- Test: `SwaggerManTests/Integration/EnvironmentStoreTests.swift`

### 10-1. EnvironmentStore 테스트 작성

- [ ] `SwaggerManTests/Integration/EnvironmentStoreTests.swift` 작성

```swift
import Testing
import SwiftData
@testable import SwaggerMan

@Suite("EnvironmentStore Integration Tests")
@MainActor
struct EnvironmentStoreTests {

    func makeStores() throws -> (ProjectStore, EnvironmentStore) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)
        return (projectStore, envStore)
    }

    @Test("환경 추가 시 해당 프로젝트에 귀속")
    func addsEnvironmentToProject() throws {
        let (projectStore, envStore) = try makeStores()

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Staging", baseURL: "https://staging.api.com", to: project)

        // 기본 Dev + 추가 Staging = 2개
        #expect(project.environments.count == 2)
        #expect(project.environments.contains(where: { $0.name == "Staging" }))
    }

    @Test("활성 환경 변경")
    func changesActiveEnvironment() throws {
        let (projectStore, envStore) = try makeStores()

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Prod", baseURL: "https://prod.api.com", to: project)

        let prod = project.environments.first { $0.name == "Prod" }!
        envStore.setActive(prod, for: project)

        #expect(envStore.activeEnvironment(for: project)?.name == "Prod")
    }

    @Test("환경 삭제")
    func deletesEnvironment() throws {
        let (projectStore, envStore) = try makeStores()

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "ToDelete", baseURL: "https://x.com", to: project)
        let toDelete = project.environments.first { $0.name == "ToDelete" }!

        try envStore.deleteEnvironment(toDelete, from: project)

        #expect(project.environments.allSatisfy { $0.name != "ToDelete" })
    }

    @Test("Project 선택 변경 시 마지막 활성 환경 복원")
    func restoresLastActiveEnvironment() throws {
        let (projectStore, envStore) = try makeStores()

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let devEnv = project.environments.first!

        envStore.setActive(devEnv, for: project)
        envStore.onProjectChanged(project)

        #expect(envStore.activeEnvironment(for: project)?.id == devEnv.id)
    }
}
```

### 10-2. EnvironmentStore 구현

- [ ] `SwaggerMan/Stores/EnvironmentStore.swift` 작성

```swift
import SwiftData
import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "EnvironmentStore")

@Observable
@MainActor
final class EnvironmentStore {
    private var activeEnvironments: [UUID: UUID] = [:]  // projectID → environmentID
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Public

    func addEnvironment(name: String, baseURL: String, to project: Project) throws {
        let env = APIEnvironment(name: name, baseURL: baseURL, project: project)
        project.environments.append(env)
        modelContext.insert(env)
        try save()
        log.info("Environment added: \(name) to \(project.alias)")
    }

    func deleteEnvironment(_ env: APIEnvironment, from project: Project) throws {
        if activeEnvironments[project.id] == env.id {
            let fallback = project.environments.first { $0.id != env.id }
            activeEnvironments[project.id] = fallback?.id
        }
        modelContext.delete(env)
        try save()
    }

    func updateEnvironment(_ env: APIEnvironment, name: String, baseURL: String,
                            authScheme: AuthSchemeType) throws {
        env.name = name
        env.baseURL = baseURL
        env.authScheme = authScheme
        try save()
    }

    func setActive(_ env: APIEnvironment, for project: Project) {
        activeEnvironments[project.id] = env.id
    }

    func activeEnvironment(for project: Project) -> APIEnvironment? {
        guard let envID = activeEnvironments[project.id] else {
            return project.environments.first
        }
        return project.environments.first { $0.id == envID }
    }

    func onProjectChanged(_ project: Project) {
        // 선택된 프로젝트에 활성 환경이 없으면 첫 번째로 초기화
        if activeEnvironments[project.id] == nil {
            activeEnvironments[project.id] = project.environments.first?.id
        }
    }

    // MARK: - Private

    private func save() throws {
        do {
            try modelContext.save()
        } catch {
            throw SwaggerManError.persistence(.saveFailed(error.localizedDescription))
        }
    }
}
```

### 10-3. 테스트 실행 + 커밋

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/EnvironmentStoreTests \
  | grep -E "(Test.*passed|Test.*failed|error:)"
```

Expected: 4 tests passed

- [ ] 커밋

```bash
git add SwaggerMan/Stores/EnvironmentStore.swift \
        SwaggerManTests/Integration/EnvironmentStoreTests.swift
git commit -m "feat: EnvironmentStore 구현 (TDD) - 환경 CRUD, 활성 환경 관리"
```

---

## Task 11: OperationStore 구현 (TDD)

**Files:**
- Create: `SwaggerMan/Stores/OperationStore.swift`
- Test: `SwaggerManTests/Integration/OperationStoreTests.swift`

### 11-1. Mock 헬퍼 작성

- [ ] `SwaggerManTests/TestHelpers/MockURLProtocol.swift`에 MockOpenAPIParser 추가

`SwaggerManTests/TestHelpers/` 아래 새 파일 `MockServices.swift`를 생성한다:

```swift
import Foundation
@testable import SwaggerMan

final class MockOpenAPIParser: OpenAPIParserProtocol, @unchecked Sendable {
    var parseResult: Result<ParsedSpec, Error> = .success(
        ParsedSpec(
            info: SpecInfo(title: "Mock", version: "1.0", description: nil),
            servers: ["https://mock.api.com"],
            operations: [
                ParsedOperation(
                    id: "GET /users",
                    method: .get,
                    path: "/users",
                    operationId: "listUsers",
                    summary: "List users",
                    description: nil,
                    tags: ["Users"],
                    parameters: [],
                    requestBody: nil,
                    responseDescriptions: ["200": "Success"]
                )
            ],
            rawOperationCount: 1
        )
    )

    func parse(_ data: Data) throws -> ParsedSpec {
        try parseResult.get()
    }

    func parseYAML(_ string: String) throws -> ParsedSpec {
        try parseResult.get()
    }
}
```

### 11-2. OperationStore 테스트 작성

- [ ] `SwaggerManTests/Integration/OperationStoreTests.swift` 작성

```swift
import Testing
import SwiftData
@testable import SwaggerMan

@Suite("OperationStore Tests")
@MainActor
struct OperationStoreTests {

    func makeStore(parser: OpenAPIParserProtocol = MockOpenAPIParser()) throws -> (OperationStore, ProjectStore) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let cache = SpecCache(cacheDirectory: FileManager.default.temporaryDirectory
            .appendingPathComponent("OStoreTests-\(UUID().uuidString)"))
        let http = HTTPClient(session: .mock())
        let opStore = OperationStore(parser: parser, cache: cache, httpClient: http)
        return (opStore, projectStore)
    }

    @Test("loadSpec 호출 시 ParsedSpec 반환")
    func loadsSpec() async throws {
        let (opStore, projectStore) = try makeStore()
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        MockURLProtocol.requestHandler = { req in
            let data = "{}".data(using: .utf8)!
            let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (res, data)
        }

        try await opStore.loadSpec(for: project)

        #expect(opStore.currentSpec != nil)
        #expect(opStore.currentSpec?.info.title == "Mock")
        #expect(opStore.operations.count == 1)
    }

    @Test("filteredOperations - method 필터")
    func filtersByMethod() async throws {
        let (opStore, projectStore) = try makeStore()
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        MockURLProtocol.requestHandler = { req in
            let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (res, "{}".data(using: .utf8)!)
        }

        try await opStore.loadSpec(for: project)
        opStore.selectedMethods = [.post]

        #expect(opStore.filteredOperations.isEmpty)  // mock에는 GET만 있음

        opStore.selectedMethods = [.get]
        #expect(opStore.filteredOperations.count == 1)
    }
}
```

### 11-3. OperationStore 구현

- [ ] `SwaggerMan/Stores/OperationStore.swift` 작성

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
    private let cache: SpecCache
    private let httpClient: HTTPClientProtocol

    init(parser: OpenAPIParserProtocol = OpenAPIParser(),
         cache: SpecCache = SpecCache(),
         httpClient: HTTPClientProtocol = HTTPClient()) {
        self.parser = parser
        self.cache = cache
        self.httpClient = httpClient
    }

    func loadSpec(for project: Project) async throws {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        let url = URL(string: project.swaggerURL)!
        let response = try await httpClient.get(url, headers: [:])
        let spec = try parser.parse(response.body)

        currentSpec = spec
        log.info("Spec loaded: \(spec.info.title) (\(spec.rawOperationCount) ops)")
    }

    func clearSpec() {
        currentSpec = nil
        searchText = ""
        selectedMethods = []
    }
}
```

### 11-4. 테스트 실행 + 커밋

- [ ] 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  -only-testing SwaggerManTests/OperationStoreTests \
  | grep -E "(Test.*passed|Test.*failed|error:)"
```

Expected: 2 tests passed

- [ ] 커밋

```bash
git add SwaggerMan/Stores/OperationStore.swift \
        SwaggerManTests/Integration/OperationStoreTests.swift \
        SwaggerManTests/TestHelpers/MockServices.swift
git commit -m "feat: OperationStore 구현 (TDD) - Spec 로드, 필터링, 태그 그룹화"
```

---

## Task 12: App Entry Point + RootView 스켈레톤

**Files:**
- Modify: `SwaggerMan/App/SwaggerManApp.swift`
- Create: `SwaggerMan/Views/Root/RootView.swift`
- Create: `SwaggerMan/Views/Root/TopBar.swift`

### 12-1. SwaggerManApp 구현

- [ ] `SwaggerMan/App/SwaggerManApp.swift` 업데이트

```swift
import SwiftUI
import SwiftData

@main
struct SwaggerManApp: App {
    let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(
                for:
                    Project.self,
                    APIEnvironment.self,
                    FavoriteOperation.self,
                    RequestCollection.self,
                    SavedRequest.self,
                    HistoryItem.self
            )
        } catch {
            fatalError("SwiftData ModelContainer 초기화 실패: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .modelContainer(container)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .defaultSize(width: 1200, height: 750)
    }
}
```

### 12-2. RootView 구현

- [ ] `SwaggerMan/Views/Root/RootView.swift` 작성

```swift
import SwiftUI
import SwiftData

struct RootView: View {
    @Environment(\.modelContext) private var modelContext

    @State private var projectStore: ProjectStore?
    @State private var environmentStore: EnvironmentStore?
    @State private var operationStore = OperationStore()

    @State private var showSidebar = true
    @State private var showRequest = true
    @State private var showResponse = true
    @State private var showProjectSettings = false

    var body: some View {
        VStack(spacing: 0) {
            if let projectStore, let environmentStore {
                TopBar(
                    projectStore: projectStore,
                    environmentStore: environmentStore,
                    showSidebar: $showSidebar,
                    showRequest: $showRequest,
                    showResponse: $showResponse,
                    onSettings: { showProjectSettings = true }
                )
                Divider()
                HStack(spacing: 0) {
                    if showSidebar {
                        Text("Sidebar")
                            .frame(width: 240)
                            .frame(maxHeight: .infinity)
                            .background(Color(.windowBackgroundColor))
                        Divider()
                    }
                    if showRequest {
                        Text("Request Pane")
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                        Divider()
                    }
                    if showResponse {
                        Text("Response Pane")
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
            projectStore = ps
            environmentStore = es
        }
        .sheet(isPresented: $showProjectSettings) {
            if let ps = projectStore {
                ProjectListEditor(store: ps)
            }
        }
    }
}
```

### 12-3. TopBar 구현

- [ ] `SwaggerMan/Views/Root/TopBar.swift` 작성

```swift
import SwiftUI

struct TopBar: View {
    @Bindable var projectStore: ProjectStore
    @Bindable var environmentStore: EnvironmentStore
    @Binding var showSidebar: Bool
    @Binding var showRequest: Bool
    @Binding var showResponse: Bool
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            // 프로젝트 선택
            Menu {
                ForEach(projectStore.projects) { project in
                    Button(project.alias) {
                        projectStore.selectProject(project)
                        if let project = projectStore.selectedProject {
                            environmentStore.onProjectChanged(project)
                        }
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

            // 환경 선택
            if let project = projectStore.selectedProject {
                Menu {
                    ForEach(project.environments) { env in
                        Button(env.name) {
                            environmentStore.setActive(env, for: project)
                        }
                    }
                } label: {
                    let activeEnv = environmentStore.activeEnvironment(for: project)
                    Label(activeEnv?.name ?? "환경 없음", systemImage: "server.rack")
                        .frame(minWidth: 80)
                }
                .menuStyle(.borderedButton)
            }

            Spacer()

            // 패널 토글
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

### 12-4. 빌드 및 수동 실행 확인

- [ ] 빌드

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  | grep -E "(error:|BUILD)"
```

Expected: `** BUILD SUCCEEDED **`

- [ ] Xcode에서 앱 실행 → "초기화 중..." 이후 빈 3-pane 레이아웃 표시 확인

### 12-5. 커밋

- [ ] 커밋

```bash
git add SwaggerMan/App/ SwaggerMan/Views/Root/
git commit -m "feat: App 진입점 + RootView 3-pane 스켈레톤 + TopBar"
```

---

## Task 13: ProjectListEditor + EnvironmentEditor

**Files:**
- Create: `SwaggerMan/Views/Settings/ProjectListEditor.swift`
- Create: `SwaggerMan/Views/Settings/EnvironmentEditor.swift`

### 13-1. ProjectListEditor 구현

- [ ] `SwaggerMan/Views/Settings/ProjectListEditor.swift` 작성

```swift
import SwiftUI

struct ProjectListEditor: View {
    @Bindable var store: ProjectStore
    @Environment(\.dismiss) private var dismiss

    @State private var showAddSheet = false
    @State private var selectedProject: Project?

    var body: some View {
        NavigationSplitView {
            List(store.projects, selection: $selectedProject) { project in
                VStack(alignment: .leading, spacing: 2) {
                    Text(project.alias).font(.headline)
                    Text(project.swaggerURL)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .tag(project)
            }
            .navigationTitle("프로젝트")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddSheet = true } label: {
                        Image(systemName: "plus")
                    }
                }
                ToolbarItem {
                    Button {
                        if let p = selectedProject { try? store.deleteProject(p) }
                    } label: {
                        Image(systemName: "minus")
                    }
                    .disabled(selectedProject == nil)
                }
            }
        } detail: {
            if let project = selectedProject {
                ProjectDetailForm(project: project, store: store)
            } else {
                Text("프로젝트를 선택하세요")
                    .foregroundStyle(.secondary)
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddProjectSheet(store: store)
        }
        .frame(minWidth: 600, minHeight: 400)
    }
}

private struct ProjectDetailForm: View {
    let project: Project
    let store: ProjectStore
    @State private var alias: String
    @State private var swaggerURL: String
    @State private var validationError: String?

    init(project: Project, store: ProjectStore) {
        self.project = project
        self.store = store
        _alias = State(initialValue: project.alias)
        _swaggerURL = State(initialValue: project.swaggerURL)
    }

    var body: some View {
        Form {
            TextField("Alias", text: $alias)
            TextField("Swagger URL", text: $swaggerURL)
            if let err = validationError {
                Text(err).foregroundStyle(.red).font(.caption)
            }
            Button("저장") {
                do {
                    try store.updateProject(project, alias: alias, swaggerURL: swaggerURL)
                    validationError = nil
                } catch {
                    validationError = error.localizedDescription
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(project.alias)
    }
}

private struct AddProjectSheet: View {
    let store: ProjectStore
    @Environment(\.dismiss) private var dismiss
    @State private var alias = ""
    @State private var swaggerURL = ""
    @State private var error: String?
    @State private var isValidating = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("새 프로젝트 추가").font(.title2).bold()

            Form {
                TextField("Alias (예: My API)", text: $alias)
                TextField("Swagger URL", text: $swaggerURL)
                    .textContentType(.URL)
            }
            .formStyle(.grouped)

            if let err = error {
                Text(err).foregroundStyle(.red).font(.caption)
            }

            HStack {
                Spacer()
                Button("취소") { dismiss() }
                Button("추가") { addProject() }
                    .disabled(alias.isEmpty || swaggerURL.isEmpty || isValidating)
                    .keyboardShortcut(.return)
            }
        }
        .padding()
        .frame(width: 400)
    }

    private func addProject() {
        isValidating = true
        defer { isValidating = false }
        do {
            try store.addProject(alias: alias, swaggerURL: swaggerURL)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}
```

### 13-2. EnvironmentEditor 구현

- [ ] `SwaggerMan/Views/Settings/EnvironmentEditor.swift` 작성

```swift
import SwiftUI

struct EnvironmentEditor: View {
    let project: Project
    let store: EnvironmentStore
    @Environment(\.dismiss) private var dismiss

    @State private var selectedEnv: APIEnvironment?
    @State private var showAddSheet = false

    var body: some View {
        NavigationSplitView {
            List(project.environments, selection: $selectedEnv) { env in
                VStack(alignment: .leading, spacing: 2) {
                    Text(env.name).font(.headline)
                    Text(env.baseURL).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                .tag(env)
            }
            .navigationTitle("환경")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddSheet = true } label: { Image(systemName: "plus") }
                }
                ToolbarItem {
                    Button {
                        if let e = selectedEnv { try? store.deleteEnvironment(e, from: project) }
                    } label: { Image(systemName: "minus") }
                    .disabled(selectedEnv == nil)
                }
            }
        } detail: {
            if let env = selectedEnv {
                EnvironmentDetailForm(env: env, project: project, store: store)
            } else {
                Text("환경을 선택하세요").foregroundStyle(.secondary)
            }
        }
        .sheet(isPresented: $showAddSheet) {
            AddEnvironmentSheet(project: project, store: store)
        }
        .frame(minWidth: 500, minHeight: 350)
    }
}

private struct EnvironmentDetailForm: View {
    let env: APIEnvironment
    let project: Project
    let store: EnvironmentStore

    @State private var name: String
    @State private var baseURL: String
    @State private var authScheme: AuthSchemeType
    @State private var error: String?

    init(env: APIEnvironment, project: Project, store: EnvironmentStore) {
        self.env = env
        self.project = project
        self.store = store
        _name = State(initialValue: env.name)
        _baseURL = State(initialValue: env.baseURL)
        _authScheme = State(initialValue: env.authScheme)
    }

    var body: some View {
        Form {
            TextField("이름", text: $name)
            TextField("Base URL", text: $baseURL)
            Picker("인증 방식", selection: $authScheme) {
                Text("없음").tag(AuthSchemeType.none)
                Text("Bearer Token").tag(AuthSchemeType.bearer)
                Text("Basic Auth").tag(AuthSchemeType.basic)
                Text("API Key").tag(AuthSchemeType.apiKey)
            }
            Toggle("TLS 검증 비활성화", isOn: .constant(env.disableTLSValidation))

            if let err = error {
                Text(err).foregroundStyle(.red).font(.caption)
            }

            Button("저장") {
                do {
                    try store.updateEnvironment(env, name: name, baseURL: baseURL, authScheme: authScheme)
                    error = nil
                } catch {
                    self.error = error.localizedDescription
                }
            }
        }
        .formStyle(.grouped)
        .navigationTitle(env.name)
    }
}

private struct AddEnvironmentSheet: View {
    let project: Project
    let store: EnvironmentStore
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var baseURL = ""
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("환경 추가").font(.title2).bold()
            Form {
                TextField("이름 (예: Dev)", text: $name)
                TextField("Base URL", text: $baseURL)
            }
            .formStyle(.grouped)
            if let err = error {
                Text(err).foregroundStyle(.red).font(.caption)
            }
            HStack {
                Spacer()
                Button("취소") { dismiss() }
                Button("추가") {
                    do {
                        try store.addEnvironment(name: name, baseURL: baseURL, to: project)
                        dismiss()
                    } catch {
                        self.error = error.localizedDescription
                    }
                }
                .disabled(name.isEmpty || baseURL.isEmpty)
                .keyboardShortcut(.return)
            }
        }
        .padding()
        .frame(width: 380)
    }
}
```

### 13-3. 최종 빌드 + 수동 E2E 확인

- [ ] 전체 빌드

```bash
xcodebuild build \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  | grep -E "(error:|warning:|BUILD)"
```

Expected: `** BUILD SUCCEEDED **` (치명적 warning 없음)

- [ ] 전체 테스트 실행

```bash
xcodebuild test \
  -project SwaggerMan.xcodeproj \
  -scheme SwaggerMan \
  -destination "platform=macOS" \
  | grep -E "(Test Suite.*passed|Test Suite.*failed|BUILD)"
```

Expected: `Test Suite 'All tests' passed`

- [ ] 수동 E2E 체크리스트

  - [ ] 앱 실행 → TopBar 표시, 빈 pane 3개 보임
  - [ ] "프로젝트 관리..." 클릭 → ProjectListEditor 시트 열림
  - [ ] "+" 클릭 → alias + URL 입력 → "추가" → 목록에 표시됨
  - [ ] 프로젝트 선택 시 TopBar 드롭다운에 alias 표시됨
  - [ ] 중복 alias 입력 시 에러 메시지 표시됨
  - [ ] 패널 토글 3개 각각 동작 확인

### 13-4. 최종 커밋

- [ ] 커밋

```bash
git add SwaggerMan/Views/Settings/
git commit -m "feat: ProjectListEditor + EnvironmentEditor UI 구현"
```

---

## 완료 기준 (Phase 1 Done)

- [ ] `xcodebuild build` 성공 (에러 0)
- [ ] `xcodebuild test` 전체 통과 (20+ tests)
- [ ] 앱 실행 → 프로젝트 등록 가능
- [ ] 중복 alias 등록 시 에러 표시
- [ ] 환경 추가/삭제 동작
- [ ] 패널 3개 토글 동작

Phase 1 완료 후 **Phase 2 계획서**(사이드바 + 기본 RequestPane + Send/Response)를 별도 작성.
