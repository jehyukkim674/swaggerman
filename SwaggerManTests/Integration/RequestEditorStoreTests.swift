import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("RequestEditorStore Tests", .serialized)
@MainActor
struct RequestEditorStoreTests {
    func makeOperation(method: HTTPMethod = .get, path: String = "/users/{id}",
                       hasBody: Bool = false) -> ParsedOperation
    {
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
            responses: [ParsedResponse(statusCode: "200", description: "Success", schema: nil)]
        )
    }

    func makeEnv(baseURL: String = "https://api.com") -> APIEnvironment {
        APIEnvironment(name: "Test", baseURL: baseURL)
    }

    @Test("loadOperation이 pathParams / queryParams 초기화")
    func loadOperationSetsParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        #expect(store.selectedOperation?.id == "GET /users/{id}")
        #expect(store.pathParams["id"] == "")
        #expect(store.queryParams.count == 1)
        #expect(store.queryParams[0].key == "limit")
    }

    @Test("loadOperation이 이전 응답 초기화")
    func loadOperationClearsResponse() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        let env = makeEnv()
        store.loadOperation(op, baseURL: "https://api.com", environment: env)
        store.loadOperation(op, baseURL: "https://api.com", environment: env)
        #expect(store.response == nil)
        #expect(store.sendError == nil)
    }

    @Test("hasBody일 때 bodyJSON 초기값 '{}'")
    func loadOperationWithBodySetsJSON() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(method: .post, path: "/users", hasBody: true)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        #expect(store.bodyJSON == "{}")
    }

    @Test("send 성공 — response 업데이트 및 HistoryItem 생성")
    func sendSuccessCreatesHistoryItem() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        try await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 201, headers: ["Content-Type": "application/json"],
                         body: Data("{\"id\":1}".utf8), durationMs: 55)
        ))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation(method: .post, path: "/users", hasBody: true)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        store.bodyJSON = "{\"name\":\"Alice\"}"

        await store.performSend(project: project, historyStore: historyStore)

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
        await mockHTTP.setExecuteResult(.failure(SwaggerManError.network(.timeout)))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        await store.performSend(project: project, historyStore: historyStore)

        #expect(store.sendError != nil)
        #expect(store.response == nil)
        #expect(project.history.isEmpty)
    }

    @Test("buildRequest — path param 치환")
    func pathParamSubstitution() async throws {
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

        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        store.pathParams["id"] = "42"

        await store.performSend(project: project, historyStore: historyStore)

        #expect(project.history.first?.fullURL.contains("/users/42") == true)
    }

    @Test("responseTab — starts as .docs")
    @MainActor
    func responseTabDefault() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        #expect(store.responseTab == .docs)
    }

    @Test("responseTab — resets to .docs on loadOperation")
    @MainActor
    func responseTabResetsOnLoad() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let env = APIEnvironment(name: "Dev", baseURL: "https://api.test")
        let op = ParsedOperation(id: "GET /x", method: .get, path: "/x",
                                 operationId: nil, summary: nil, description: nil,
                                 tags: [], parameters: [], requestBody: nil, responses: [])
        store.responseTab = .response
        store.loadOperation(op, baseURL: "https://api.test", environment: env)
        #expect(store.responseTab == .docs)
    }

    @Test("responseTab — switches to .response after send")
    @MainActor
    func responseTabAfterSend() async throws {
        let mockClient = MockHTTPClient()
        let store = RequestEditorStore(httpClient: mockClient)
        let env = APIEnvironment(name: "Dev", baseURL: "https://api.test")
        let op = ParsedOperation(id: "GET /x", method: .get, path: "/x",
                                 operationId: nil, summary: nil, description: nil,
                                 tags: [], parameters: [], requestBody: nil, responses: [])
        store.loadOperation(op, baseURL: "https://api.test", environment: env,
                            projectID: UUID())
        #expect(store.responseTab == .docs)

        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "T", swaggerURL: "https://api.test")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        await store.performSend(project: project, historyStore: historyStore)
        #expect(store.responseTab == .response)
    }

    // MARK: - 중복 키 크래시 회귀 테스트

    @Test("restoreEditorState — 중복(빈) 헤더 키여도 크래시하지 않음")
    @MainActor
    func restoreWithDuplicateHeaderKeysDoesNotCrash() {
        let pid = UUID()
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        let env = makeEnv()
        store.loadOperation(op, baseURL: "https://api.com", environment: env, projectID: pid)
        // 사용자가 "헤더 추가"를 두 번 눌러 빈 키 헤더 2개 생성 → 중복 키
        store.requestHeaders.append(RequestParam(key: "", value: "a", enabled: true))
        store.requestHeaders.append(RequestParam(key: "", value: "b", enabled: true))
        store.persistCurrentState()
        // 같은 operation 재로드 시 restoreEditorState가 저장된 중복 키를 읽음
        store.loadOperation(op, baseURL: "https://api.com", environment: env, projectID: pid)
        #expect(store.selectedOperation?.id == op.id)
    }

    @Test("restoreEditorState — 중복 쿼리 키여도 크래시하지 않음")
    @MainActor
    func restoreWithDuplicateQueryKeysDoesNotCrash() {
        let pid = UUID()
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = ParsedOperation(
            id: "GET /search", method: .get, path: "/search",
            operationId: nil, summary: nil, description: nil, tags: [],
            parameters: [
                ParsedParameter(id: "q1", name: "tag", location: .query,
                                required: false, schema: nil, description: nil),
                ParsedParameter(id: "q2", name: "tag", location: .query,
                                required: false, schema: nil, description: nil)
            ],
            requestBody: nil, responses: []
        )
        let env = makeEnv()
        store.loadOperation(op, baseURL: "https://api.com", environment: env, projectID: pid)
        store.persistCurrentState()
        store.loadOperation(op, baseURL: "https://api.com", environment: env, projectID: pid)
        #expect(store.selectedOperation?.id == op.id)
    }

    @Test("loadOperation — 중복 path 파라미터 이름이어도 크래시하지 않음")
    @MainActor
    func loadOperationWithDuplicatePathParamsDoesNotCrash() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = ParsedOperation(
            id: "GET /a/{id}/b/{id}", method: .get, path: "/a/{id}/b/{id}",
            operationId: nil, summary: nil, description: nil, tags: [],
            parameters: [
                ParsedParameter(id: "p1", name: "id", location: .path,
                                required: true, schema: nil, description: nil),
                ParsedParameter(id: "p2", name: "id", location: .path,
                                required: true, schema: nil, description: nil)
            ],
            requestBody: nil, responses: []
        )
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        #expect(store.pathParams["id"] == "")
    }

    // MARK: - 요청 취소

    @Test("cancelSend — 진행 중 요청 취소 시 response 없음, isSending false, 히스토리 미생성")
    @MainActor
    func cancelDuringSend() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 10)
        ))
        await mockHTTP.setDelay(2_000_000_000) // 2초 — 취소 전 완료 방지

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        // fire-and-forget로 시작 후 즉시 취소
        store.send(project: project, historyStore: historyStore)
        await Task.yield() // 요청이 execute(sleep)까지 진입하도록 양보
        store.cancelSend()
        try? await Task.sleep(nanoseconds: 150_000_000) // 취소 정리 대기

        #expect(store.isSending == false)
        #expect(store.response == nil)
        #expect(store.sendError == nil) // 취소는 에러로 표시하지 않음
        #expect(project.history.isEmpty)
    }

    // MARK: - 히스토리 요청값 복원

    @Test("restoreParams — fullURL에서 path/query 파라미터 값 복원")
    @MainActor
    func restoreParamsRestoresPathAndQuery() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation() // GET /users/{id} — path: id, query: limit
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        let item = HistoryItem(
            environmentID: UUID(),
            method: "GET",
            path: "/users/{id}",
            fullURL: "https://api.com/users/42?limit=10",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "",
            responseSize: 0,
            durationMs: 1
        )
        store.restoreParams(from: item)

        #expect(store.pathParams["id"] == "42")
        let limit = store.queryParams.first { $0.key == "limit" }
        #expect(limit?.value == "10")
        #expect(limit?.enabled == true)
    }
}
