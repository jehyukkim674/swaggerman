import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("RequestEditorStore History Tests", .serialized)
@MainActor
struct RequestEditorStoreHistoryTests {
    func makeOp() -> ParsedOperation {
        ParsedOperation(
            id: "GET /users", method: .get, path: "/users",
            operationId: nil, summary: nil, description: nil,
            tags: [], parameters: [], requestBody: nil,
            responses: []
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
