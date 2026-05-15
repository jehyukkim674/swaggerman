# Swagger Man — 설계 문서

- **작성일**: 2026-05-15
- **프로젝트 경로**: `~/Dev/swagger-man`
- **상태**: Design (구현 전)

## 1. 개요

OpenAPI 3.x(Swagger) 기반 API의 요청/응답을 빠르고 시각적으로 탐색·실행할 수 있는 macOS 14+ 네이티브 앱.

### 1.1 핵심 가치
- **빠른 탐색**: 등록된 Swagger URL을 골라 endpoint 목록을 즉시 확인
- **쉬운 실행**: 스키마 기반 자동 폼 생성으로 본문 입력을 단순화
- **재사용**: 환경(Environment) 단위 baseURL/토큰 관리, 즐겨찾기·컬렉션·히스토리
- **이식**: 모든 요청은 cURL로 한 번에 복사 가능

### 1.2 비대상(Non-goals)
- OpenAPI 2.0(Swagger) 지원
- iOS/Windows/Linux (macOS 14+ 전용)
- Mocking, 스키마 비교(diff), 자동 테스트 실행
- 팀 협업/동기화 (1인 로컬용)
- App Store 배포 (1차 목표 외)

## 2. 사용자 시나리오

1. **새 Swagger 등록**: alias `My API`로 `https://api.example.com/v3/api-docs` 추가 → Dev 환경 자동 생성.
2. **환경 추가/전환**: Dev/Staging/Prod 환경별 baseURL과 토큰 등록 → TopBar에서 한 클릭 전환.
3. **endpoint 탐색**: 사이드바에서 Tag/Path 토글, Method 필터, 검색으로 빠르게 찾기. 자주 쓰는 endpoint는 ⭐로 즐겨찾기 → 사이드바 최상단 고정.
4. **요청 작성**: 스키마에서 자동 생성된 폼에 값 입력, 또는 JSON 모드로 직접 작성.
5. **요청 실행**: Send → 우측 응답 패널에 status/body/timing 표시. 자동으로 히스토리 적재.
6. **재사용**: 자주 쓰는 요청은 Collection에 저장. 임시 재실행은 히스토리에서.
7. **공유**: 우상단 "📋 cURL"로 복사하여 터미널 동료에게 전달.

## 3. 아키텍처

### 3.1 기술 스택
- **언어/프레임워크**: Swift 5.9+, SwiftUI, **SwiftData**
- **최소 OS**: macOS 14 Sonoma
- **상태 관리**: `@Observable` 기반 MVVM (Store + ViewModel)
- **빌드**: Xcode 16+ (Swift Testing 사용)
- **배포**: Developer ID 서명 (App Store 미배포)

### 3.2 의존성 (Swift Package Manager)

| 패키지 | 용도 |
|---|---|
| `OpenAPIKit` (mattpolzin) | OpenAPI 3.0/3.1 파싱 |
| `Yams` | YAML 형태 Swagger 입력 지원 |
| `CodeEditorView` (mchakravarty) | JSON syntax highlight 에디터 |
| `KeychainAccess` (kishikawakatsumi) | Keychain 접근 단순화 |
| `swift-snapshot-testing` (pointfreeco) | UI 스냅샷 테스트 |

### 3.3 모듈/파일 구조

```
SwaggerMan/
├── App/
│   └── SwaggerManApp.swift              # @main, ModelContainer 주입
├── Models/                              # 비영속 도메인 모델 (Codable)
│   ├── ParsedSpec.swift
│   ├── Operation.swift
│   ├── ParsedSchema.swift
│   ├── HTTPRequest.swift
│   └── HTTPResponse.swift
├── Persistence/                         # SwiftData @Model (영속)
│   ├── Project.swift
│   ├── Environment.swift
│   ├── FavoriteOperation.swift
│   ├── Collection.swift
│   ├── SavedRequest.swift
│   └── HistoryItem.swift
├── Stores/                              # @Observable 상태 관리
│   ├── ProjectStore.swift
│   ├── EnvironmentStore.swift
│   ├── OperationStore.swift
│   ├── RequestEditorStore.swift
│   ├── FavoriteStore.swift
│   ├── CollectionStore.swift
│   └── HistoryStore.swift
├── Services/                            # 순수 로직, protocol 기반 DI
│   ├── OpenAPIParser.swift
│   ├── HTTPClient.swift
│   ├── KeychainService.swift
│   ├── CurlBuilder.swift
│   ├── SchemaFormBuilder.swift
│   ├── JSONFormatter.swift
│   └── SpecCache.swift
├── Views/
│   ├── Root/
│   │   ├── RootView.swift               # NavigationSplitView
│   │   └── TopBar.swift                 # URL/환경 선택, 토큰 빠른접근, 패널 토글
│   ├── Sidebar/
│   │   ├── SidebarView.swift
│   │   ├── FavoriteSectionView.swift    # 최상단 ⭐ 섹션 (드래그 정렬)
│   │   ├── OperationListView.swift      # Tag/Path 토글, search, method filter
│   │   └── CollectionListView.swift
│   ├── Request/
│   │   ├── RequestPaneView.swift
│   │   ├── ParamsTab.swift
│   │   ├── HeadersTab.swift
│   │   ├── BodyTab.swift                # 폼 모드 ↔ JSON 모드 토글
│   │   ├── AuthTab.swift
│   │   └── SchemaForm/                  # 자동 폼 컴포넌트 (재귀 렌더)
│   ├── Response/
│   │   └── ResponsePaneView.swift       # status/headers/body, search, copy
│   └── Settings/
│       ├── ProjectListEditor.swift      # Swagger URL 등록/alias
│       └── EnvironmentEditor.swift      # baseURL + auth 설정
└── Resources/
    ├── Assets.xcassets
    └── Info.plist

SwaggerManTests/
├── Services/
├── Integration/
└── UISnapshots/
```

### 3.4 레이어 책임

| 레이어 | 책임 | 의존 가능 대상 |
|---|---|---|
| **View** | SwiftUI 렌더링, 사용자 입력 → Store 액션 | Store만 |
| **Store** | @Observable 상태, View ↔ Service 중계, 비즈니스 워크플로 | Service, Persistence |
| **Service** | 파싱·HTTP·Keychain·캐시 등 순수 로직, 외부 I/O | 외부 라이브러리, 시스템 API |
| **Persistence** | SwiftData @Model 정의 | (선언만, 의존성 없음) |
| **Model** | 비영속 도메인 모델 | (선언만) |

원칙:
- View는 Store만 알고, Persistence/Service를 직접 호출하지 않는다.
- Service는 Protocol을 노출하여 테스트 시 mock 주입.
- Store는 SwiftData ModelContext와 Service를 모두 사용해 워크플로 조립.

### 3.5 레이아웃 (UI)

3-Pane 가로 분할 + 각 패널 토글 (TopBar 우측 버튼 3개로 사이드바/요청/응답 각각 숨김 가능).

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar: [Project ▾] [Env ▾]   ⚙Token  [⫷ ⫶ ⫸] (패널 토글)   │
├──────────────┬──────────────────┬───────────────────────────┤
│ Sidebar      │ Request Pane     │ Response Pane             │
│ ⭐ Favorites │ GET /users  Send │ 200 · 142ms  📋 cURL      │
│ 🏷 Tags      │ Params|Headers|  │ Headers                   │
│   Users      │  Body|Auth       │ Body (JSON pretty)        │
│   Auth       │ (form / JSON)    │                           │
│ 🔍 search    │                  │                           │
└──────────────┴──────────────────┴───────────────────────────┘
```

## 4. 데이터 모델

### 4.1 SwiftData @Model (영속)

```swift
@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var alias: String
    var swaggerURL: String
    var createdAt: Date
    var lastUsedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Environment.project)
    var environments: [Environment]
    @Relationship(deleteRule: .cascade, inverse: \Collection.project)
    var collections: [Collection]
    @Relationship(deleteRule: .cascade, inverse: \FavoriteOperation.project)
    var favorites: [FavoriteOperation]
    @Relationship(deleteRule: .cascade, inverse: \HistoryItem.project)
    var history: [HistoryItem]
}

@Model
final class Environment {
    @Attribute(.unique) var id: UUID
    var project: Project
    var name: String                 // "Dev" / "Staging" / "Prod"
    var baseURL: String
    var authScheme: AuthSchemeType   // none / bearer / basic / apiKey
    var apiKeyHeaderName: String?
    var apiKeyLocation: String?      // header / query
    var disableTLSValidation: Bool   // 개발 편의
    // 실제 secret 값은 Keychain (key: "com.swaggerman.token.{projectId}.{envId}")
}

enum AuthSchemeType: String, Codable { case none, bearer, basic, apiKey }

@Model
final class FavoriteOperation {
    @Attribute(.unique) var id: UUID
    var project: Project
    var method: String
    var path: String
    var sortOrder: Int               // 드래그 정렬용
    var createdAt: Date
}

@Model
final class Collection {
    @Attribute(.unique) var id: UUID
    var project: Project
    var name: String
    var sortOrder: Int

    @Relationship(deleteRule: .cascade, inverse: \SavedRequest.collection)
    var requests: [SavedRequest]
}

@Model
final class SavedRequest {
    @Attribute(.unique) var id: UUID
    var collection: Collection
    var name: String
    var method: String
    var path: String                 // 템플릿 (e.g. /users/{id})
    var pathParamsJSON: String
    var queryParamsJSON: String
    var headersJSON: String
    var bodyJSON: String?
    var sortOrder: Int
    var createdAt: Date
    var updatedAt: Date
}

@Model
final class HistoryItem {
    @Attribute(.unique) var id: UUID
    var project: Project
    var environmentID: UUID
    var method: String
    var path: String
    var fullURL: String
    var requestHeadersJSON: String
    var requestBody: String?
    var responseStatus: Int
    var responseHeadersJSON: String
    var responseBody: String         // 1MB 초과 시 truncate
    var responseSize: Int
    var durationMs: Int
    var executedAt: Date
}
```

### 4.2 비영속 도메인 모델 (파싱 결과)

```swift
struct ParsedSpec {
    let info: SpecInfo
    let servers: [String]
    let operations: [Operation]
    let securitySchemes: [SecurityScheme]
}

struct Operation: Identifiable {
    let id: String                 // "{method} {path}"
    let method: HTTPMethod
    let path: String
    let summary: String?
    let tags: [String]
    let parameters: [Parameter]
    let requestBody: RequestBodySpec?
    let responses: [String: ResponseSpec]
    let security: [SecurityRequirement]
}
```

### 4.3 Keychain

| 키 | 값 |
|---|---|
| `com.swaggerman.token.{projectId}.{envId}` | Bearer token / Basic credentials / API key |

### 4.4 캐시

| 위치 | 내용 |
|---|---|
| `~/Library/Caches/SwaggerMan/spec_{hash(swaggerURL)}.json` | 파싱 직전 원본 응답 + ETag |

### 4.5 정책

- **히스토리**: Project당 최근 500개 보관, 초과분은 오래된 순 삭제
- **응답 본문 최대**: 1MB 초과 시 truncate + "(truncated)" 표시
- **Project alias**: 중복 불가
- **Swagger URL**: 다른 alias로는 중복 등록 가능

## 5. 데이터 흐름 / 핵심 시나리오

### 5.1 앱 실행 → URL 선택 → endpoint 탐색
1. `SwaggerManApp` → `ModelContainer` 주입 → `RootView` 표시
2. TopBar의 Project 드롭다운에서 사용자가 선택
3. `ProjectStore.selectedProject` 변경 → `lastUsedAt` 갱신, 마지막 사용 환경 자동 활성화
4. `OperationStore.loadSpec(swaggerURL)`:
   - 캐시(URL+ETag) hit → 캐시된 `ParsedSpec` 반환
   - miss → `HTTPClient.get` → `OpenAPIParser.parse` → 캐시에 저장
5. SidebarView: ⭐ Favorites + Tag/Path 그룹 + 검색/Method 필터 적용
6. 사용자가 operation 클릭 → `RequestEditorStore.load(op, env)`:
   - `SchemaFormBuilder.build(op.requestBody.schema)` → 폼 트리
   - 기본값(default/example) 채움
   - Auth 헤더 자동 추가 (env.authScheme + Keychain 토큰)

### 5.2 요청 실행 → 응답 → 히스토리
1. `RequestEditorStore.send()`:
   - 폼 → `HTTPRequest` 빌드 (path/query/headers/body 합성)
   - `HTTPClient.execute(req)` (URLSession)
   - 시작 시각 기록 → 응답 시 `durationMs` 계산
2. ResponsePaneView 갱신
3. `HistoryStore.append(item)` → SwiftData insert → 500 초과 시 정리
4. 응답 본문 1MB 초과 시 truncate

### 5.3 cURL 복사
- `CurlBuilder.build(req, options)` → 클립보드
- 옵션: 토큰 마스킹 토글 (`Bearer ***`)

### 5.4 URL/Alias 등록
- ProjectListEditor sheet:
  - alias + URL 입력 → "검증" 버튼: `HTTPClient.get` + 파싱 시도
  - 성공: title/operation 개수 미리보기 → 저장
  - 실패: 에러 종류별 메시지 (네트워크/파싱/스키마)
- 저장 시 default Environment 자동 생성 (`baseURL = spec.servers[0]`)

### 5.5 즐겨찾기
- ⭐ 클릭 → `FavoriteStore.toggle(project, op)`
- 사이드바 드래그 → `FavoriteStore.reorder([...])` → `sortOrder` 재할당

### 5.6 환경 전환
- TopBar 환경 드롭다운 변경 → `EnvironmentStore.activeEnvironment` 갱신
- `RequestEditorStore.refreshForEnvironment()`:
  - baseURL 변경 반영
  - Auth 헤더 재생성 (Keychain 새 환경 토큰 조회)
  - 사용자가 입력하던 body/params는 보존

### 5.7 Collection 저장
- RequestPane "Save" 메뉴 → SaveRequestSheet:
  - Collection 선택/생성 + 이름 입력
- `CollectionStore.save(currentRequestState, into: collection, name: ...)`

### 5.8 상호작용 다이어그램
```
View ─(action)─▶ Store ─(method)─▶ Service ─(I/O)─▶ Network/Disk/Keychain
View ◀(state)── Store ◀(result)── Service
```

## 6. 에러 처리

### 6.1 분류 및 처리

| 분류 | 케이스 | 처리 |
|---|---|---|
| Swagger 로드 | 네트워크 실패 | 토스트 + "재시도", 마지막 캐시 사용 옵션 |
| | 401/403 | "이 swagger URL은 인증이 필요합니다" 안내 |
| | JSON/YAML 파싱 실패 | 다이얼로그: 줄/컬럼 + 원본 일부 |
| | OpenAPI 2.0 감지 | "지원하지 않습니다" 명확히 거부 |
| | 미지원 schema keyword | "JSON 모드로 전환 필요" 인라인 표시 |
| 요청 실행 | timeout (기본 30s) | ResponsePane "Timeout" + 재시도 |
| | DNS/호스트 실패 | "호스트 연결 실패" + baseURL 안내 |
| | TLS 검증 실패 | "TLS 검증 실패" + 환경 설정 토글 안내 |
| | 4xx/5xx 응답 | 정상 표시 (색상 강조만) |
| | 비-텍스트 응답 | "(binary, N bytes)" + 저장 버튼 |
| | 1MB 초과 | 앞 1MB만 표시 + "(truncated)" |
| 폼 입력 | required 미입력 | 인라인 에러 + Send 차단 |
| | 타입 불일치 | 빨간 테두리 + 메시지 |
| | invalid JSON | Send 차단 + 위치 표시 |
| 인증 | 토큰 미설정 + 필요 endpoint | 노란 배너: "Auth 탭에서 설정" |
| | Keychain 거부 | 다이얼로그 + 평문 fallback 동의 |
| | 401 만료 추정 | "토큰 만료 가능 — 환경에서 갱신" 배너 |
| 저장 | SwiftData 실패 | 토스트 + 로그, in-memory 유지 |
| | alias 중복 | 인라인 검증 |
| 앱 상태 | macOS 14 미만 | Info.plist + 런타임 메시지 |
| | 캐시 손상 | 자동 무효화 + 재요청 |

### 6.2 에러 타입

```swift
enum SwaggerManError: LocalizedError {
    case network(NetworkError)
    case parsing(ParsingError)
    case auth(AuthError)
    case persistence(PersistenceError)
    case validation(ValidationError)
}

enum NetworkError {
    case offline
    case timeout
    case dnsFailure(host: String)
    case tlsFailure(detail: String)
    case unauthorizedSwagger
    case unexpectedStatus(Int, body: String)
}
```

### 6.3 표시 일관성

- **모달**: 사용자 결정 필요 시 (예: TLS 무시할지)
- **인라인 배너**: 화면 컨텍스트 경고 (인증 필요/검증 실패)
- **토스트**: 일시 알림 (저장 실패/복사 완료)
- **로그**: `os.Logger` (subsystem `com.swaggerman`, category별, Authorization 헤더 자동 redaction)

### 6.4 회복 전략

| 상황 | 회복 |
|---|---|
| Spec 캐시 손상 | 자동 삭제 + 재요청 |
| 마지막 Project 삭제 | 첫 Project로 자동 전환 |
| Environment 삭제 | 같은 Project의 다른 환경으로 전환, 없으면 추가 유도 |
| 앱 재시작 | 마지막 Project/Environment/Operation 복원 |

### 6.5 보안 엣지

- cURL 복사 시 토큰 마스킹 옵션 (`Bearer ***`)
- 로그 Authorization 자동 redaction
- 앱 백그라운드 화면 가리기는 미구현 (필요 시 후속)

## 7. 테스트 전략

### 7.1 계층

| 계층 | 도구 | 대상 | 비중 |
|---|---|---|---|
| Unit | Swift Testing | Services + Parsers | 70% |
| Integration | Swift Testing + in-memory ModelContainer | Store + Persistence | 20% |
| UI Snapshot | swift-snapshot-testing | 주요 View 회귀 | 10% |
| Manual | 체크리스트 | E2E 시나리오 | 출시 전 |

### 7.2 주요 Unit 테스트

```
SwaggerManTests/Services/
├── OpenAPIParserTests           — 3.0/3.1, YAML, $ref, 잘못된 JSON, 2.0 거부
├── CurlBuilderTests             — GET/POST/JSON, 치환, 마스킹, 정렬
├── SchemaFormBuilderTests       — primitive/object/array/enum/required/oneOf
├── KeychainServiceTests         — mock으로 save/load/delete, 권한 거부
├── HTTPClientTests              — URLProtocol stub: timeout/status/헤더
└── JSONFormatterTests
```

### 7.3 Integration

```
SwaggerManTests/Integration/
├── ProjectStoreTests            — 추가/삭제/lastUsedAt/alias 중복
├── HistoryStoreTests            — 500 정리, cascade
├── FavoriteStoreTests           — toggle/reorder/sortOrder 일관성
└── RequestEditorStoreTests      — load → send → HistoryItem 적재
```

### 7.4 UI Snapshot

```
SwaggerManUITests/
├── SidebarSnapshotTests         — 즐겨찾기/Tag/검색결과
├── RequestPaneSnapshotTests     — 각 탭, 폼/JSON 모드
└── ResponsePaneSnapshotTests    — 200/4xx/binary/truncated
```
- 다크/라이트 두 변형

### 7.5 수동 E2E 체크리스트

- [ ] 새 Project 등록 → swagger 파싱 성공
- [ ] Project 2개 등록 후 전환 시 사이드바/즐겨찾기 분리
- [ ] Environment 3개 추가 → 전환 시 baseURL/토큰 변경
- [ ] Bearer / Basic / API Key 각각 인증 endpoint 정상 호출
- [ ] 폼 모드 nested object 입력 → JSON 모드 전환 시 일치
- [ ] 즐겨찾기 추가/드래그 정렬 → 재시작 후 순서 유지
- [ ] Collection 저장 → 다시 불러와 send 동일 결과
- [ ] 히스토리 500개 초과 자동 정리
- [ ] cURL 복사 → 터미널 실행 시 동일 응답
- [ ] cURL 토큰 마스킹 동작
- [ ] 오프라인 적절한 에러 메시지
- [ ] 패널 3개 각각 토글 동작
- [ ] Light/Dark 모드 정상

### 7.6 의존성 주입

```swift
protocol HTTPClientProtocol { func execute(_: HTTPRequest) async throws -> HTTPResponse }
protocol KeychainServiceProtocol { /* ... */ }

final class RequestEditorStore {
    init(http: HTTPClientProtocol, keychain: KeychainServiceProtocol, /* ... */) { }
}
```
프로덕션은 실 구현체, 테스트는 mock.

### 7.7 커버리지 목표
- Services: ≥ 85%
- Stores: ≥ 70%
- Views: 측정만, 강제 안 함 (snapshot 회귀로 대신)

### 7.8 CI
- 1차: 미적용 (개인용)
- 후속: GitHub Actions macOS-14 러너에서 `xcodebuild test`

## 8. 위험 / 미결정

| 위험 / 미결정 | 비고 |
|---|---|
| `OpenAPIKit`이 자주 보는 실 사양에서 처리 못 하는 케이스 | 1단계 직후 실제 cmdb-backend-kt swagger로 검증, 부족하면 fallback 파서 |
| `SchemaFormBuilder` — `oneOf`/`anyOf`/polymorphism | 1차에선 미지원 시 "JSON 모드 전환" 유도, 후속 개선 |
| `CodeEditorView` 라이브러리 안정성 | 대체로 `TextEditor` + 자체 syntax highlight 검토 |
| SwiftData 마이그레이션 | 모델 변경 시 `VersionedSchema` 채택 검토 |
| 토큰 갱신 (refresh token) 자동화 | 1차 미지원, 후속 결정 |

## 9. 단계별 마일스톤 (참고)

후속 implementation plan에서 상세화. 큰 그림:

1. 프로젝트 골격 + Project/Environment 등록 + Swagger 파싱·캐시
2. 사이드바(Tag/Path/Search/Filter) + 기본 RequestPane(JSON 모드만) + Send/Response
3. SchemaFormBuilder + 폼 모드
4. Keychain + Auth(bearer/basic/apiKey) + cURL 복사
5. 즐겨찾기 + 드래그 정렬
6. 히스토리(500 정리) + Collection
7. UI 마감(패널 토글, 다크모드, 단축키) + 수동 E2E
