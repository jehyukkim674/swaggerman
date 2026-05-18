import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("OperationStore Tests", .serialized)
@MainActor
struct OperationStoreTests {
    func makeStore(parser: OpenAPIParserProtocol = MockOpenAPIParser(),
                   httpClient: (any HTTPClientProtocol)? = nil,
                   cache: (any SpecCacheProtocol)? = nil) throws // swiftlint:disable:next large_tuple
        -> (OperationStore, ProjectStore, _container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let resolvedHTTP: any HTTPClientProtocol = httpClient ?? MockHTTPClient()
        let resolvedCache: any SpecCacheProtocol = cache ?? MockSpecCache()
        let opStore = OperationStore(parser: parser, httpClient: resolvedHTTP, cache: resolvedCache)
        return (opStore, projectStore, container)
    }

    @Test("loadSpec 호출 시 ParsedSpec 반환")
    func loadsSpec() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try await opStore.loadSpec(for: project)

        #expect(opStore.currentSpec != nil)
        #expect(opStore.currentSpec?.info.title == "Mock")
        #expect(opStore.operations.count == 1)
    }

    @Test("캐시 히트 시 네트워크 미호출")
    func cacheHitSkipsNetwork() async throws {
        let mockCache = MockSpecCache()
        let (opStore, projectStore, _container) = try makeStore(cache: mockCache)
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        // First load: fetches from network (MockHTTPClient), stores in cache
        try await opStore.loadSpec(for: project)
        #expect(opStore.currentSpec?.info.title == "Mock")

        // Second load after clearSpec: must serve from cache (MockHTTPClient would succeed too,
        // but storeCallCount==1 proves cache was used, not the HTTP client)
        opStore.clearSpec()
        try await opStore.loadSpec(for: project)
        #expect(opStore.currentSpec?.info.title == "Mock")

        let storeCount = await mockCache.storeCallCount
        #expect(storeCount == 1)
    }

    @Test("selectedMethods 필터 - POST는 제외됨")
    func filtersByMethod() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        try await opStore.loadSpec(for: project)

        opStore.selectedMethods = [.post]
        #expect(opStore.filteredOperations.isEmpty)

        opStore.selectedMethods = [.get]
        #expect(opStore.filteredOperations.count == 1)
    }

    @Test("selectedTag 필터 - 태그로 operation 필터링")
    func filtersByTag() async throws {
        let multiTagParser = MockOpenAPIParser()
        multiTagParser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Multi-tag", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [
                ParsedOperation(id: "GET /users", method: .get, path: "/users",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Users"], parameters: [], requestBody: nil,
                                responseDescriptions: [:]),
                ParsedOperation(id: "GET /orders", method: .get, path: "/orders",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responseDescriptions: [:]),
                ParsedOperation(id: "POST /orders", method: .post, path: "/orders",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responseDescriptions: [:])
            ],
            securitySchemes: [],
            rawOperationCount: 3
        ))
        let (opStore, projectStore, _container) = try makeStore(parser: multiTagParser)
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        try await opStore.loadSpec(for: project)

        #expect(opStore.availableTags == ["Orders", "Users"])

        opStore.selectedTag = "Orders"
        #expect(opStore.filteredOperations.count == 2)
        #expect(opStore.filteredOperations.allSatisfy { $0.tags.first == "Orders" })

        opStore.selectedTag = "Users"
        #expect(opStore.filteredOperations.count == 1)

        opStore.selectedTag = nil
        #expect(opStore.filteredOperations.count == 3)
    }

    @Test("clearSpec 호출 시 selectedTag 초기화")
    func clearSpecResetsSelectedTag() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        try await opStore.loadSpec(for: project)

        opStore.selectedTag = "Users"
        opStore.clearSpec()

        #expect(opStore.selectedTag == nil)
    }
}
