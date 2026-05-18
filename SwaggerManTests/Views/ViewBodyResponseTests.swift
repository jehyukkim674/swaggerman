import SwiftData
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("View Body Response Tests", .serialized)
@MainActor
struct ViewBodyResponseTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeOp(method: HTTPMethod = .get, path: String = "/users") -> ParsedOperation {
        ParsedOperation(
            id: "\(method.rawValue) \(path)", method: method, path: path,
            operationId: nil, summary: "Test", description: nil,
            tags: [], parameters: [], requestBody: nil, responses: [ParsedResponse(
                statusCode: "200",
                description: "OK",
                schema: nil
            )]
        )
    }

    // MARK: - ResponseDetailView

    @Test("ResponseDetailView — 200, headers, JSON body, curl string")
    func responseDetailView200Full() {
        let response = HTTPResponse(
            statusCode: 200,
            headers: ["Content-Type": "application/json", "X-Request-ID": "abc"],
            body: Data(#"{"ok":true}"#.utf8),
            durationMs: 42
        )
        _ = ResponseDetailView(response: response, curlString: "curl -X GET https://api.com", lastRequest: nil).body
    }

    @Test("ResponseDetailView — 200, no headers, no curl")
    func responseDetailView200NoHeaders() {
        let response = HTTPResponse(statusCode: 200, headers: [:],
                                    body: Data("plain text".utf8), durationMs: 5)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — 301 redirect (yellow statusColor)")
    func responseDetailView301() {
        let response = HTTPResponse(statusCode: 301, headers: [:], body: Data(), durationMs: 3)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — 404 client error (orange statusColor)")
    func responseDetailView404() {
        let response = HTTPResponse(statusCode: 404, headers: [:],
                                    body: Data(#"{"error":"Not found"}"#.utf8), durationMs: 12)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — 500 server error (red statusColor)")
    func responseDetailView500() {
        let response = HTTPResponse(statusCode: 500, headers: [:],
                                    body: Data("Server Error".utf8), durationMs: 200)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — body > 1MB truncation")
    func responseDetailViewLargeBodyTruncation() {
        let largeBody = Data(String(repeating: "x", count: 1_100_000).utf8)
        let response = HTTPResponse(statusCode: 200, headers: [:], body: largeBody, durationMs: 1000)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — formatSize KB range")
    func responseDetailViewKBSize() {
        let body = Data(String(repeating: "a", count: 2048).utf8)
        let response = HTTPResponse(statusCode: 200, headers: [:], body: body, durationMs: 10)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — formatSize MB range")
    func responseDetailViewMBSize() {
        let body = Data(String(repeating: "a", count: 2_097_152).utf8)
        let response = HTTPResponse(statusCode: 200, headers: [:], body: body, durationMs: 300)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    @Test("ResponseDetailView — formatSize B range")
    func responseDetailViewBSize() {
        let response = HTTPResponse(statusCode: 200, headers: [:], body: Data("hi".utf8), durationMs: 1)
        _ = ResponseDetailView(response: response, curlString: nil, lastRequest: nil).body
    }

    // MARK: - SendErrorView

    @Test("SendErrorView — network offline error body 실행")
    func sendErrorViewNetworkOffline() {
        _ = SendErrorView(error: SwaggerManError.network(.offline)).body
    }

    @Test("SendErrorView — generic error body 실행")
    func sendErrorViewGeneric() {
        _ = SendErrorView(error: URLError(.badServerResponse)).body
    }

    // MARK: - ResponseHeadersSection

    @Test("ResponseHeadersSection — multiple headers body 실행")
    func responseHeadersSectionMultipleHeaders() {
        _ = ResponseHeadersSection(headers: [
            "Content-Type": "application/json",
            "X-Rate-Limit": "100",
            "Cache-Control": "no-cache"
        ]).body
    }

    // MARK: - ResponsePaneView with actual states

    @Test("ResponsePaneView — 200 응답 있는 경우 body 실행")
    func responsePaneViewWithSuccessResponse() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(HTTPResponse(
            statusCode: 200,
            headers: ["Content-Type": "application/json"],
            body: Data(#"{"result":"ok"}"#.utf8),
            durationMs: 42
        )))

        let store = RequestEditorStore(httpClient: mockHTTP)
        store.loadOperation(makeOp(), baseURL: "https://api.com",
                            environment: APIEnvironment(name: "T", baseURL: "https://api.com"))
        await store.send(project: project, historyStore: historyStore)

        _ = ResponsePaneView(store: store).body
    }

    @Test("ResponsePaneView — sendError 있는 경우 body 실행")
    func responsePaneViewWithSendError() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.failure(SwaggerManError.network(.offline)))

        let store = RequestEditorStore(httpClient: mockHTTP)
        store.loadOperation(makeOp(), baseURL: "https://api.com",
                            environment: APIEnvironment(name: "T", baseURL: "https://api.com"))
        await store.send(project: project, historyStore: historyStore)

        _ = ResponsePaneView(store: store).body
    }

    @Test("ResponsePaneView — 404 응답 headers 있는 경우 body 실행")
    func responsePaneViewWith404Response() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)

        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(HTTPResponse(
            statusCode: 404,
            headers: ["Content-Type": "application/json", "X-Request-ID": "xyz"],
            body: Data(#"{"error":"not found"}"#.utf8),
            durationMs: 8
        )))

        let store = RequestEditorStore(httpClient: mockHTTP)
        store.loadOperation(makeOp(), baseURL: "https://api.com",
                            environment: APIEnvironment(name: "T", baseURL: "https://api.com"))
        await store.send(project: project, historyStore: historyStore)

        _ = ResponsePaneView(store: store).body
    }
}
