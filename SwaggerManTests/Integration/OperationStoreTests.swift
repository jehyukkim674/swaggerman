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

    @Test("reloadSpec — 캐시를 무효화하고 강제로 다시 가져옴")
    func reloadSpecForcesRefetch() async throws {
        let mockCache = MockSpecCache()
        let (opStore, projectStore, _container) = try makeStore(cache: mockCache)
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        // 최초 로드 → 네트워크에서 가져와 캐시에 저장 (store 1회)
        try await opStore.loadSpec(for: project)
        let afterFirst = await mockCache.storeCallCount
        #expect(afterFirst == 1)

        // 리로드 → 캐시 무효화 후 재요청 → 캐시 미스로 다시 저장 (store 2회)
        // (무효화가 없었다면 캐시 히트라 store는 1회로 유지됨 → cacheHitSkipsNetwork 참고)
        try await opStore.reloadSpec(for: project)
        #expect(opStore.currentSpec?.info.title == "Mock")
        let afterReload = await mockCache.storeCallCount
        #expect(afterReload == 2)
    }

    @Test("saveFilterState — selectedTag가 nil이어도 크래시하지 않음 (plist 유효성)")
    func filterStateWithNilTagDoesNotCrash() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        try await opStore.loadSpec(for: project) // currentProject 설정 → 필터 저장 키 유효

        opStore.selectedTag = nil
        // 아래 변경들이 saveFilterState를 트리거. nil tag를 NSNull로 저장하면 기존엔 크래시했음.
        opStore.searchText = "users"
        opStore.selectedMethods = [.get]
        opStore.selectedTag = "Users"
        opStore.selectedTag = nil

        #expect(opStore.searchText == "users")
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
                                responses: []),
                ParsedOperation(id: "GET /orders", method: .get, path: "/orders",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responses: []),
                ParsedOperation(id: "POST /orders", method: .post, path: "/orders",
                                operationId: nil, summary: nil, description: nil,
                                tags: ["Orders"], parameters: [], requestBody: nil,
                                responses: [])
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
