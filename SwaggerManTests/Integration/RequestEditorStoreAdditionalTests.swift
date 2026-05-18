// swiftlint:disable file_length type_body_length
import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("RequestEditorStore Additional Tests", .serialized)
@MainActor
struct RequestEditorStoreAdditionalTests {
    func makeOp(method: HTTPMethod = .get, path: String = "/api",
                hasBody: Bool = false,
                headerParams: [ParsedParameter] = []) -> ParsedOperation
    {
        ParsedOperation(
            id: "\(method.rawValue) \(path)",
            method: method,
            path: path,
            operationId: nil,
            summary: nil,
            description: nil,
            tags: [],
            parameters: headerParams,
            requestBody: hasBody
                ? ParsedRequestBody(required: true, contentType: "application/json", schema: nil)
                : nil,
            responseDescriptions: [:]
        )
    }

    func makeEnv(scheme: AuthSchemeType = .none,
                 bearer: String? = nil,
                 user: String? = nil,
                 pass: String? = nil,
                 apiKeyName: String? = nil,
                 apiKeyValue: String? = nil,
                 apiKeyInQuery: Bool? = nil) -> APIEnvironment
    {
        let env = APIEnvironment(name: "Test", baseURL: "https://api.com")
        env.authScheme = scheme
        env.bearerToken = bearer
        env.basicUsername = user
        env.basicPassword = pass
        env.apiKeyHeaderName = apiKeyName
        env.apiKeyValue = apiKeyValue
        env.apiKeyInQuery = apiKeyInQuery
        return env
    }

    @Test("clearSelection 이후 모든 상태 초기화")
    func clearSelectionResetsAll() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOp()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        store.clearSelection()

        #expect(store.selectedOperation == nil)
        #expect(store.currentBaseURL == "")
        #expect(store.pathParams.isEmpty)
        #expect(store.queryParams.isEmpty)
        #expect(store.requestHeaders.isEmpty)
        #expect(store.bodyJSON == "")
        #expect(store.response == nil)
        #expect(store.sendError == nil)
    }

    @Test("Bearer auth → Authorization 헤더 자동 추가")
    func bearerAuthHeader() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .bearer, bearer: "my-token-123")
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let authHeader = store.requestHeaders.first { $0.key == "Authorization" }
        #expect(authHeader != nil)
        #expect(authHeader?.value.contains("Bearer my-token-123") == true)
        #expect(authHeader?.enabled == true)
    }

    @Test("Bearer 토큰 없음 → Authorization 헤더 비활성화")
    func bearerAuthHeaderDisabledWhenEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .bearer, bearer: "")
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let authHeader = store.requestHeaders.first { $0.key == "Authorization" }
        #expect(authHeader != nil)
        #expect(authHeader?.enabled == false)
    }

    @Test("Basic auth → Authorization 헤더 Base64 인코딩")
    func basicAuthHeader() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .basic, user: "admin", pass: "secret")
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let authHeader = store.requestHeaders.first { $0.key == "Authorization" }
        #expect(authHeader != nil)
        #expect(authHeader?.value.hasPrefix("Basic ") == true)
        #expect(authHeader?.enabled == true)

        // Verify the base64 content
        let expected = Data("admin:secret".utf8).base64EncodedString()
        #expect(authHeader?.value == "Basic \(expected)")
    }

    @Test("Basic auth 사용자명 없음 → Authorization 비활성화")
    func basicAuthHeaderDisabledWhenEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .basic, user: "", pass: "")
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let authHeader = store.requestHeaders.first { $0.key == "Authorization" }
        #expect(authHeader?.enabled == false)
    }

    @Test("API Key (header) → 커스텀 헤더 추가")
    func apiKeyHeaderAuth() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .apiKey, apiKeyName: "X-API-Key", apiKeyValue: "key-abc", apiKeyInQuery: false)
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let keyHeader = store.requestHeaders.first { $0.key == "X-API-Key" }
        #expect(keyHeader != nil)
        #expect(keyHeader?.value == "key-abc")
        #expect(keyHeader?.enabled == true)
    }

    @Test("API Key (query) → 헤더에 추가되지 않음")
    func apiKeyQueryNotAddedToHeaders() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .apiKey, apiKeyName: "api_key", apiKeyValue: "key-xyz", apiKeyInQuery: true)
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let keyHeader = store.requestHeaders.first { $0.key == "api_key" }
        #expect(keyHeader == nil)
    }

    @Test("API Key 기본 헤더 이름 fallback")
    func apiKeyDefaultHeaderName() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .apiKey, apiKeyName: nil, apiKeyValue: "key-default", apiKeyInQuery: false)
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: env)

        let keyHeader = store.requestHeaders.first { $0.key == "X-API-Key" }
        #expect(keyHeader != nil)
    }

    @Test("securityHeaders가 Authorization 포함 시 env auth 추가 안 됨")
    func securityHeadersOverrideEnvAuth() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = makeEnv(scheme: .bearer, bearer: "env-token")
        let securityHeaders = ["Authorization": "Bearer scheme-token"]
        store.loadOperation(makeOp(), baseURL: "https://api.com",
                            environment: env, securityHeaders: securityHeaders)

        let authHeaders = store.requestHeaders.filter { $0.key.lowercased() == "authorization" }
        #expect(authHeaders.count == 1)
        #expect(authHeaders[0].value == "Bearer scheme-token")
    }

    @Test("spec header param → 헤더에 추가됨")
    func specHeaderParamAddedToHeaders() {
        let headerParam = ParsedParameter(
            id: "X-Request-ID-header",
            name: "X-Request-ID",
            location: .header,
            required: true,
            schema: nil,
            description: nil
        )
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOp(headerParams: [headerParam])
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        let reqIDHeader = store.requestHeaders.first { $0.key == "X-Request-ID" }
        #expect(reqIDHeader != nil)
        #expect(reqIDHeader?.isFromSpec == true)
        #expect(reqIDHeader?.isRequired == true)
        #expect(reqIDHeader?.enabled == true)
    }

    @Test("spec header param 중복 방지 — securityHeaders에 이미 있으면 추가 안 됨")
    func specHeaderParamDeduplication() {
        let headerParam = ParsedParameter(
            id: "Authorization-header",
            name: "Authorization",
            location: .header,
            required: true,
            schema: nil,
            description: nil
        )
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOp(headerParams: [headerParam])
        let securityHeaders = ["Authorization": "Bearer my-token"]
        store.loadOperation(op, baseURL: "https://api.com",
                            environment: makeEnv(), securityHeaders: securityHeaders)

        let authHeaders = store.requestHeaders.filter { $0.key.lowercased() == "authorization" }
        #expect(authHeaders.count == 1)
    }

    @Test("hasBody → Content-Type: application/json 자동 추가")
    func contentTypeAddedForBody() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOp(hasBody: true)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        let ctHeader = store.requestHeaders.first { $0.key == "Content-Type" }
        #expect(ctHeader != nil)
        #expect(ctHeader?.value == "application/json")
    }

    @Test("Accept: application/json 항상 추가")
    func acceptHeaderAlwaysAdded() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.loadOperation(makeOp(), baseURL: "https://api.com", environment: makeEnv())

        let acceptHeader = store.requestHeaders.first { $0.key == "Accept" }
        #expect(acceptHeader != nil)
        #expect(acceptHeader?.value == "application/json")
    }

    @Test("query param에 값 있을 때 URL에 추가됨")
    func queryParamInURL() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 5)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let op = ParsedOperation(
            id: "GET /search",
            method: .get,
            path: "/search",
            operationId: nil,
            summary: nil,
            description: nil,
            tags: [],
            parameters: [
                ParsedParameter(id: "q-query", name: "q", location: .query,
                                required: false, schema: nil, description: nil)
            ],
            requestBody: nil,
            responseDescriptions: [:]
        )

        let store = RequestEditorStore(httpClient: mockHTTP)
        store.loadOperation(op, baseURL: "https://api.com",
                            environment: APIEnvironment(name: "Test", baseURL: "https://api.com"))
        store.queryParams[0].value = "swift"

        await store.send(project: project, historyStore: historyStore)

        #expect(project.history.first?.fullURL.contains("q=swift") == true)
    }

    @Test("비활성화된 query param은 URL에 포함되지 않음")
    func disabledQueryParamNotInURL() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 5)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let op = ParsedOperation(
            id: "GET /search",
            method: .get,
            path: "/search",
            operationId: nil,
            summary: nil,
            description: nil,
            tags: [],
            parameters: [
                ParsedParameter(id: "q-query", name: "q", location: .query,
                                required: false, schema: nil, description: nil)
            ],
            requestBody: nil,
            responseDescriptions: [:]
        )

        let store = RequestEditorStore(httpClient: mockHTTP)
        store.loadOperation(op, baseURL: "https://api.com",
                            environment: APIEnvironment(name: "Test", baseURL: "https://api.com"))
        store.queryParams[0].value = "swift"
        store.queryParams[0].enabled = false

        await store.send(project: project, historyStore: historyStore)

        #expect(project.history.first?.fullURL.contains("q=") == false)
    }

    @Test("isSending — send 중에는 true")
    func isSendingDuringSend() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 10)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let store = RequestEditorStore(httpClient: mockHTTP)
        let op = ParsedOperation(
            id: "GET /ping", method: .get, path: "/ping",
            operationId: nil, summary: nil, description: nil,
            tags: [], parameters: [], requestBody: nil, responseDescriptions: [:]
        )
        store.loadOperation(op, baseURL: "https://api.com",
                            environment: APIEnvironment(name: "T", baseURL: "https://api.com"))

        await store.send(project: project, historyStore: historyStore)
        #expect(store.isSending == false) // should be false after completion
    }

    @Test("lastCurlString 설정됨")
    func lastCurlStringSet() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 10)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let store = RequestEditorStore(httpClient: mockHTTP)
        let op = ParsedOperation(
            id: "GET /ping", method: .get, path: "/ping",
            operationId: nil, summary: nil, description: nil,
            tags: [], parameters: [], requestBody: nil, responseDescriptions: [:]
        )
        store.loadOperation(op, baseURL: "https://api.com",
                            environment: APIEnvironment(name: "T", baseURL: "https://api.com"))
        await store.send(project: project, historyStore: historyStore)

        #expect(store.lastCurlString != nil)
        #expect(store.lastCurlString?.contains("curl") == true)
    }

    @Test("body에 Content-Type 없을 때 application/json 자동 추가")
    func bodyContentTypeAutoAdded() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 201, headers: [:], body: Data(), durationMs: 10)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let store = RequestEditorStore(httpClient: mockHTTP)
        let op = makeOp(method: .post, hasBody: true)
        let env = APIEnvironment(name: "T", baseURL: "https://api.com")
        store.loadOperation(op, baseURL: "https://api.com", environment: env)
        // Remove Content-Type header to test auto-add
        store.requestHeaders.removeAll { $0.key == "Content-Type" }
        store.bodyJSON = "{\"test\": true}"

        await store.send(project: project, historyStore: historyStore)
        #expect(store.response != nil)
    }

    @Test("send — disableTLS true가 HTTPClient로 전달됨")
    func sendPassesDisableTLS() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockClient = MockHTTPClient()
        await mockClient.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 5)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let store = RequestEditorStore(httpClient: mockClient)
        let op = ParsedOperation(
            id: "GET /test", method: .get, path: "/test",
            operationId: nil, summary: nil, description: nil,
            tags: [], parameters: [], requestBody: nil,
            responseDescriptions: [:]
        )
        let env = APIEnvironment(name: "Dev", baseURL: "https://api.test")
        store.loadOperation(op, baseURL: env.baseURL, environment: env, securityHeaders: [:])

        await store.send(project: project, historyStore: historyStore, disableTLS: true)

        let disableTLSUsed = await mockClient.lastDisableTLS
        #expect(disableTLSUsed == true)
    }

    @Test("send without selectedOperation — 빠른 리턴")
    func sendWithoutSelectedOperationNoop() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let store = RequestEditorStore(httpClient: MockHTTPClient())
        // Don't call loadOperation → selectedOperation is nil
        await store.send(project: project, historyStore: historyStore)

        #expect(store.response == nil)
        #expect(store.sendError == nil)
    }
}

// swiftlint:enable file_length type_body_length
