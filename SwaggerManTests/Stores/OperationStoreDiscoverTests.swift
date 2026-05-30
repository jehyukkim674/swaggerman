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

        // 지정하지 않은 모든 후보 URL은 기본적으로 실패하게 한다.
        // (wellKnown 후보 목록이 늘어나도 깨지지 않도록 기본값을 실패로 설정)
        await mockHTTP.setGetResult(.failure(URLError(.notConnectedToInternet)))
        // index.html만 HTML을 반환해 디스커버리를 트리거한다.
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )

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

    // MARK: - discoverSpec — 401 decoy가 유효 spec을 가로채면 안 됨

    @Test("discoverSpec — 일부 후보가 401이어도 유효한 spec을 찾으면 로드 성공")
    func discoverSpecIgnoresUnauthorizedDecoy() async throws {
        let mockHTTP = MockHTTPClient()
        // 지정하지 않은 후보는 모두 실패(miss)
        await mockHTTP.setGetResult(.failure(URLError(.notConnectedToInternet)))
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )
        // decoy: 인증이 필요한 후보 (Springdoc 그룹 구성에서 흔함)
        let unauthorized = HTTPResponse(statusCode: 401, headers: [:], body: Data(), durationMs: 1)
        await mockHTTP.setURLResult(for: "https://api.com/openapi.json", .success(unauthorized))
        await mockHTTP.setURLResult(for: "https://api.com/api-docs", .success(unauthorized))
        // 실제로 열려있는 유효 spec
        await mockHTTP.setURLResult(for: "https://api.com/v3/api-docs", .success(makeSpecResponse()))

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        try await store.loadSpec(for: project)
        #expect(store.currentSpec != nil)
        #expect(store.loadError == nil)
    }

    @Test("discoverSpec — 모든 후보가 401 → unauthorized 에러")
    func discoverSpecAllUnauthorized() async throws {
        let mockHTTP = MockHTTPClient()
        await mockHTTP.setGetResult(.success(
            HTTPResponse(statusCode: 401, headers: [:], body: Data(), durationMs: 1)
        ))
        await mockHTTP.setURLResult(
            for: "https://api.com/swagger-ui/index.html",
            .success(makeHTMLResponse())
        )

        let store = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: mockHTTP,
            cache: MockSpecCache()
        )
        let project = MockProjectFactory.make(swaggerURL: "https://api.com/swagger-ui/index.html")
        await #expect(throws: SwaggerManError.self) {
            try await store.loadSpec(for: project)
        }
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
