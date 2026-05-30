// swiftlint:disable file_length type_body_length
import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("OperationStore Additional Tests", .serialized)
@MainActor
struct OperationStoreAdditionalTests {
    func makeStore(parser: OpenAPIParserProtocol = MockOpenAPIParser(),
                   httpClient: (any HTTPClientProtocol)? = nil,
                   cache: (any SpecCacheProtocol)? = nil) throws // swiftlint:disable:next large_tuple
        -> (OperationStore, ProjectStore, _container: ModelContainer)
    {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let resolvedHTTP: any HTTPClientProtocol = httpClient ?? MockHTTPClient()
        let resolvedCache: any SpecCacheProtocol = cache ?? MockSpecCache()
        let opStore = OperationStore(parser: parser, httpClient: resolvedHTTP, cache: resolvedCache)
        return (opStore, projectStore, container)
    }

    func makeSpec(securitySchemes: [ParsedSecurityScheme]) -> ParsedSpec {
        ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [],
            securitySchemes: securitySchemes,
            rawOperationCount: 0
        )
    }

    // MARK: - computedSecurityHeaders

    @Test("computedSecurityHeaders — apiKey header scheme")
    func computedSecurityHeadersAPIKey() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "apiAuth",
                name: "apiAuth",
                kind: .apiKey(name: "X-API-Key", location: "header"),
                description: nil
            )
        ]))

        let opStore2 = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore2.loadSpec(for: project)

        opStore2.securityValues["apiAuth"] = "my-key-123"

        let headers = opStore2.computedSecurityHeaders
        #expect(headers["X-API-Key"] == "my-key-123")
    }

    @Test("computedSecurityHeaders — bearer scheme")
    func computedSecurityHeadersBearer() async throws {
        let (_, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "bearerAuth",
                name: "bearerAuth",
                kind: .http(scheme: "bearer"),
                description: nil
            )
        ]))

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)
        opStore.securityValues["bearerAuth"] = "my-jwt-token"

        let headers = opStore.computedSecurityHeaders
        #expect(headers["Authorization"] == "Bearer my-jwt-token")
    }

    @Test("computedSecurityHeaders — basic scheme")
    func computedSecurityHeadersBasic() async throws {
        let (_, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "basicAuth",
                name: "basicAuth",
                kind: .http(scheme: "basic"),
                description: nil
            )
        ]))

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)
        opStore.securityValues["basicAuth"] = "user:pass"

        let headers = opStore.computedSecurityHeaders
        #expect(headers["Authorization"] == "Basic user:pass")
    }

    @Test("computedSecurityHeaders — oauth2 scheme (no header)")
    func computedSecurityHeadersOAuth2NoHeader() async throws {
        let (_, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "oauth2",
                name: "oauth2",
                kind: .oauth2,
                description: nil
            )
        ]))

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)
        opStore.securityValues["oauth2"] = "some-token"

        let headers = opStore.computedSecurityHeaders
        #expect(headers.isEmpty)
    }

    @Test("computedSecurityHeaders — empty value skipped")
    func computedSecurityHeadersEmptyValueSkipped() async throws {
        let (_, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "bearerAuth",
                name: "bearerAuth",
                kind: .http(scheme: "bearer"),
                description: nil
            )
        ]))

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)
        // Not setting any value

        let headers = opStore.computedSecurityHeaders
        #expect(headers.isEmpty)
    }

    @Test("computedSecurityHeaders — apiKey query location (not header)")
    func computedSecurityHeadersAPIKeyQueryNotAdded() async throws {
        let (_, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "apiKey",
                name: "apiKey",
                kind: .apiKey(name: "api_key", location: "query"),
                description: nil
            )
        ]))

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)
        opStore.securityValues["apiKey"] = "my-key"

        let headers = opStore.computedSecurityHeaders
        #expect(headers.isEmpty)
    }

    // MARK: - searchText filtering

    @Test("searchText — path로 필터링")
    func searchTextFiltersByPath() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [
                ParsedOperation(id: "GET /users", method: .get, path: "/users",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Users"], parameters: [], requestBody: nil,
                                responses: []),
                ParsedOperation(id: "GET /orders", method: .get, path: "/orders",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responses: [])
            ],
            securitySchemes: [],
            rawOperationCount: 2
        ))

        let (_, projectStore, _container) = try makeStore(parser: parser)
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)

        opStore.searchText = "user"
        #expect(opStore.filteredOperations.count == 1)
        #expect(opStore.filteredOperations[0].path == "/users")
    }

    @Test("searchText — summary로 필터링")
    func searchTextFiltersBySummary() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [
                ParsedOperation(id: "GET /api/v1", method: .get, path: "/api/v1",
                                operationId: nil, summary: "List all users", description: nil,
                                tags: ["Users"], parameters: [], requestBody: nil,
                                responses: []),
                ParsedOperation(id: "GET /api/v2", method: .get, path: "/api/v2",
                                operationId: nil, summary: "Get orders", description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responses: [])
            ],
            securitySchemes: [],
            rawOperationCount: 2
        ))

        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        opStore.searchText = "orders"
        #expect(opStore.filteredOperations.count == 1)
        #expect(opStore.filteredOperations[0].summary == "Get orders")
    }

    @Test("searchText — tag로 필터링")
    func searchTextFiltersByTag() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [
                ParsedOperation(id: "GET /a", method: .get, path: "/a",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Payments"], parameters: [], requestBody: nil,
                                responses: []),
                ParsedOperation(id: "GET /b", method: .get, path: "/b",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Users"], parameters: [], requestBody: nil,
                                responses: [])
            ],
            securitySchemes: [],
            rawOperationCount: 2
        ))

        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        opStore.searchText = "Payment"
        #expect(opStore.filteredOperations.count == 1)
    }

    @Test("operationsByTag — 태그별 그룹핑")
    func operationsByTag() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: [],
            operations: [
                ParsedOperation(id: "GET /users", method: .get, path: "/users",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Users"], parameters: [], requestBody: nil,
                                responses: []),
                ParsedOperation(id: "POST /users", method: .post, path: "/users",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Users"], parameters: [], requestBody: nil,
                                responses: []),
                ParsedOperation(id: "GET /orders", method: .get, path: "/orders",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responses: [])
            ],
            securitySchemes: [],
            rawOperationCount: 3
        ))

        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        let grouped = opStore.operationsByTag
        #expect(grouped.count == 2)
        let usersGroup = grouped.first { $0.tag == "Users" }
        #expect(usersGroup?.operations.count == 2)
        let ordersGroup = grouped.first { $0.tag == "Orders" }
        #expect(ordersGroup?.operations.count == 1)
    }

    @Test("태그 없는 operation은 Other로 그룹핑")
    func operationWithNoTagGroupedAsOther() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: [],
            operations: [
                ParsedOperation(id: "GET /health", method: .get, path: "/health",
                                operationId: nil, summary: nil, description: nil,
                                tags: [], parameters: [], requestBody: nil,
                                responses: [])
            ],
            securitySchemes: [],
            rawOperationCount: 1
        ))

        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        #expect(opStore.availableTags.contains("Other"))
        let grouped = opStore.operationsByTag
        let otherGroup = grouped.first { $0.tag == "Other" }
        #expect(otherGroup != nil)
    }

    @Test("securityValues 변경 → savedSecurityValues 저장")
    func securityValuesSavedToProject() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "bearerAuth", name: "bearerAuth",
                kind: .http(scheme: "bearer"), description: nil
            )
        ]))

        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        opStore.securityValues["bearerAuth"] = "test-token"

        #expect(project.securityValuesJSON?.contains("bearerAuth") == true)
        #expect(project.securityValuesJSON?.contains("test-token") == true)
    }

    @Test("loadSecurityValues — 프로젝트에서 값 복원")
    func loadSecurityValuesFromProject() async throws {
        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        // Manually set security JSON
        project.securityValuesJSON = "{\"apiKey\":\"stored-key\"}"

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(makeSpec(securitySchemes: [
            ParsedSecurityScheme(
                id: "apiKey", name: "apiKey",
                kind: .apiKey(name: "X-API-Key", location: "header"), description: nil
            )
        ]))

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        #expect(opStore.securityValues["apiKey"] == "stored-key")
    }

    @Test("isLoading true 중 false로 전환")
    func isLoadingFalseAfterLoad() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try await opStore.loadSpec(for: project)
        #expect(opStore.isLoading == false)
    }

    @Test("파싱 실패 시 loadError 설정")
    func loadErrorSetOnParsingFailure() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .failure(SwaggerManError.parsing(.invalidJSON("bad")))

        let container = try ModelContainerFactory.makeInMemory()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())

        await #expect(throws: SwaggerManError.self) {
            try await opStore.loadSpec(for: project)
        }
        #expect(opStore.loadError != nil)
    }

    // MARK: - buildSpecAuthHeaders (spec 가져올 때의 인증)

    @Test("buildSpecAuthHeaders — bearer 타입")
    func specAuthBearer() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        project.specAuthType = "bearer"
        project.specAuthValue1 = "tok123"

        let headers = try await opStore.buildSpecAuthHeaders(for: project)
        #expect(headers["Authorization"] == "Bearer tok123")
    }

    @Test("buildSpecAuthHeaders — basic 타입은 base64 인코딩")
    func specAuthBasic() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        project.specAuthType = "basic"
        project.specAuthValue1 = "user"
        project.specAuthValue2 = "pass"

        let headers = try await opStore.buildSpecAuthHeaders(for: project)
        let expected = Data("user:pass".utf8).base64EncodedString()
        #expect(headers["Authorization"] == "Basic \(expected)")
    }

    @Test("buildSpecAuthHeaders — apikey 타입")
    func specAuthAPIKey() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        project.specAuthType = "apikey"
        project.specAuthValue1 = "X-API-Key"
        project.specAuthValue2 = "secret"

        let headers = try await opStore.buildSpecAuthHeaders(for: project)
        #expect(headers["X-API-Key"] == "secret")
    }

    @Test("buildSpecAuthHeaders — login 타입은 토큰을 추출해 Bearer로 반환")
    func specAuthLoginExtractsToken() async throws {
        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200, headers: [:],
                         body: Data("{\"access_token\":\"jwt-xyz\"}".utf8), durationMs: 5)
        ))
        let (opStore, projectStore, _container) = try makeStore(httpClient: mockHTTP)
        _ = _container
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        project.specAuthType = "login"
        project.specAuthValue1 = "https://api.com/login"
        project.specAuthValue2 = "user"
        project.specAuthValue3 = "pass"

        let headers = try await opStore.buildSpecAuthHeaders(for: project)
        #expect(headers["Authorization"] == "Bearer jwt-xyz")
    }

    @Test("buildSpecAuthHeaders — login 응답에 토큰 없으면 Set-Cookie 폴백")
    func specAuthLoginCookieFallback() async throws {
        let mockHTTP = MockHTTPClient()
        await mockHTTP.setExecuteResult(.success(
            HTTPResponse(statusCode: 200,
                         headers: ["Set-Cookie": "session=abc; Path=/; HttpOnly"],
                         body: Data("{}".utf8), durationMs: 5)
        ))
        let (opStore, projectStore, _container) = try makeStore(httpClient: mockHTTP)
        _ = _container
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        project.specAuthType = "login"
        project.specAuthValue1 = "https://api.com/login"
        project.specAuthValue2 = "user"
        project.specAuthValue3 = "pass"

        let headers = try await opStore.buildSpecAuthHeaders(for: project)
        #expect(headers["Cookie"] == "session=abc")
    }
}

// swiftlint:enable file_length type_body_length
