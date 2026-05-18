import Foundation
import Testing
@testable import SwaggerMan

@Suite("OperationStore Discover Spec Tests", .serialized)
@MainActor
struct OperationStoreDiscoverTests {
    let htmlBody = Data("<html><body>Swagger UI</body></html>".utf8)
    let specJSONBody = Data("{}".utf8)

    func makeSpecResponse() -> HTTPResponse {
        HTTPResponse(statusCode: 200, headers: [:], body: specJSONBody, durationMs: 1)
    }

    func makeHTMLResponse() -> HTTPResponse {
        HTTPResponse(statusCode: 200, headers: [:], body: htmlBody, durationMs: 1)
    }

    // MARK: - discoverSpec via swagger-config (relative URL)

    @Test("discoverSpec — swagger-config에서 상대 spec URL 발견")
    func discoverSpecViaSwaggerConfigRelative() async throws {
        let mockHTTP = MockHTTPClient()
        let configJSON = Data(#"{"url":"/v3/api-docs"}"#.utf8)

        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/swagger-config",
            .success(HTTPResponse(statusCode: 200, headers: [:], body: configJSON, durationMs: 1))
        )
        await mockHTTP.setURLResult(
            for: "https://api.com/v3/api-docs",
            .success(makeSpecResponse())
        )

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        try await store.loadSpec(for: project)
        #expect(store.currentSpec != nil)
    }

    // MARK: - discoverSpec via swagger-config (absolute URL)

    @Test("discoverSpec — swagger-config에서 절대 spec URL 발견")
    func discoverSpecViaSwaggerConfigAbsolute() async throws {
        let mockHTTP = MockHTTPClient()
        let configJSON = Data(#"{"url":"https://other.api.com/openapi.json"}"#.utf8)

        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/swagger-config",
            .success(HTTPResponse(statusCode: 200, headers: [:], body: configJSON, durationMs: 1))
        )
        await mockHTTP.setURLResult(
            for: "https://other.api.com/openapi.json",
            .success(makeSpecResponse())
        )

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        try await store.loadSpec(for: project)
        #expect(store.currentSpec != nil)
    }

    // MARK: - discoverSpec via candidate paths

    @Test("discoverSpec — swagger-config 실패 후 candidate path에서 발견")
    func discoverSpecViaCandidatePath() async throws {
        let mockHTTP = MockHTTPClient()

        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        // swagger-config fails
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/swagger-config",
            .failure(URLError(.notConnectedToInternet))
        )
        // /v3/api-docs succeeds
        await mockHTTP.setURLResult(
            for: "https://api.com/v3/api-docs",
            .success(makeSpecResponse())
        )

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        try await store.loadSpec(for: project)
        #expect(store.currentSpec != nil)
    }

    // MARK: - discoverSpec — swagger-config returns empty url

    @Test("discoverSpec — swagger-config url 필드 없음, candidate에서 발견")
    func discoverSpecSwaggerConfigNoURL() async throws {
        let mockHTTP = MockHTTPClient()
        let configJSON = Data(#"{"title":"My API"}"#.utf8)

        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/swagger-config",
            .success(HTTPResponse(statusCode: 200, headers: [:], body: configJSON, durationMs: 1))
        )
        await mockHTTP.setURLResult(
            for: "https://api.com/openapi.json",
            .success(makeSpecResponse())
        )

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        try await store.loadSpec(for: project)
        #expect(store.currentSpec != nil)
    }

    // MARK: - discoverSpec — all fail → throws

    @Test("discoverSpec — 모든 경로 실패 → throws")
    func discoverSpecAllFail() async throws {
        let mockHTTP = MockHTTPClient()

        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        // All other URLs fail (default getResult is a success with empty body
        // but empty body is not HTML so discoverSpec won't be re-entered — set to failure)
        let failResult: Result<HTTPResponse, Error> = .failure(URLError(.notConnectedToInternet))
        for path in [
            "/swagger-ui/swagger-config",
            "/v3/api-docs",
            "/openapi.json",
            "/api/schema/",
            "/api-docs",
            "/swagger.json"
        ] {
            await mockHTTP.setURLResult(for: "https://api.com\(path)", failResult)
        }

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")

        await #expect(throws: Error.self) {
            try await store.loadSpec(for: project)
        }
        #expect(store.loadError != nil)
    }

    // MARK: - swaggerConfigSpecURL — empty config URL

    @Test("swaggerConfigSpecURL — config url 빈 문자열 → nil 반환")
    func swaggerConfigSpecURLEmptyString() async throws {
        let mockHTTP = MockHTTPClient()
        let configJSON = Data(#"{"url":""}"#.utf8)

        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/swagger-config",
            .success(HTTPResponse(statusCode: 200, headers: [:], body: configJSON, durationMs: 1))
        )
        // /v3/api-docs candidate succeeds as fallback
        await mockHTTP.setURLResult(
            for: "https://api.com/v3/api-docs",
            .success(makeSpecResponse())
        )

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        try await store.loadSpec(for: project)
        #expect(store.currentSpec != nil)
    }
}

// MARK: - Factory

private enum MockProjectFactory {
    @MainActor
    static func make(swaggerURL: String) -> Project {
        Project(alias: "Test", swaggerURL: swaggerURL)
    }
}
