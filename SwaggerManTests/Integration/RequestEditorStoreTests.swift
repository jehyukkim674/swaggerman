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
        await mockHTTP.setExecuteResult(.failure(SwaggerManError.network(.timeout)))

        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let historyStore = HistoryStore(modelContext: ctx)
        let store = RequestEditorStore(httpClient: mockHTTP)

        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())

        await store.send(project: project, historyStore: historyStore)

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

        await store.send(project: project, historyStore: historyStore)

        #expect(project.history.first?.fullURL.contains("/users/42") == true)
    }
}
