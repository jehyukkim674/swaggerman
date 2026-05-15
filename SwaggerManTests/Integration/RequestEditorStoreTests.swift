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
    func loadOperationSetsParams() async {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())

        #expect(store.selectedOperation?.id == "GET /users/{id}")
        #expect(store.pathParams["id"] == "")
        #expect(store.queryParams.count == 1)
        #expect(store.queryParams[0].key == "limit")
    }

    @Test("loadOperation이 이전 응답 초기화")
    func loadOperationClearsResponse() async {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        store.loadOperation(op, baseURL: "https://api.com", envID: UUID())
        #expect(store.response == nil)
        #expect(store.sendError == nil)
    }

    @Test("hasBody일 때 bodyJSON 초기값 '{}'")
    func loadOperationWithBodySetsJSON() async {
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
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 201, headers: ["Content-Type": "application/json"],
                         body: "{\"id\":1}".data(using: .utf8)!, durationMs: 55)
        ))

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
        await mockHTTP.setExecuteResult(.failure(SwaggerManError.network(.timeout)))

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
    func pathParamSubstitution() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        _ = container

        let mockHTTP = MockHTTPClient()

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
