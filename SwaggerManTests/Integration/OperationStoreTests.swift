import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("OperationStore Tests", .serialized)
@MainActor
struct OperationStoreTests {

    func makeStore(parser: OpenAPIParserProtocol = MockOpenAPIParser(),
                   cache: (any SpecCacheProtocol)? = nil) throws -> (OperationStore, ProjectStore, _container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let http = HTTPClient(session: .mock())
        let resolvedCache: any SpecCacheProtocol = cache ?? MockSpecCache()
        let opStore = OperationStore(parser: parser, httpClient: http, cache: resolvedCache)
        return (opStore, projectStore, container)
    }

    @Test("loadSpec 호출 시 ParsedSpec 반환")
    func loadsSpec() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        MockURLProtocol.requestHandler = { req in
            let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (res, "{}".data(using: .utf8)!)
        }
        defer { MockURLProtocol.requestHandler = nil }

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

        MockURLProtocol.requestHandler = { req in
            let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (res, "{}".data(using: .utf8)!)
        }
        defer { MockURLProtocol.requestHandler = nil }

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        // First load: populates memory cache
        try await opStore.loadSpec(for: project)
        #expect(opStore.currentSpec?.info.title == "Mock")

        // Second load after clearSpec: handler nil → must serve from cache
        opStore.clearSpec()
        MockURLProtocol.requestHandler = nil
        try await opStore.loadSpec(for: project)
        #expect(opStore.currentSpec?.info.title == "Mock")

        // store was called exactly once (first load only — cache was used on second load)
        let storeCount = await mockCache.storeCallCount
        #expect(storeCount == 1)
    }

    @Test("selectedMethods 필터 - POST는 제외됨")
    func filtersByMethod() async throws {
        let (opStore, projectStore, _container) = try makeStore()
        _ = _container

        MockURLProtocol.requestHandler = { req in
            let res = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (res, "{}".data(using: .utf8)!)
        }
        defer { MockURLProtocol.requestHandler = nil }

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        try await opStore.loadSpec(for: project)

        opStore.selectedMethods = [.post]
        #expect(opStore.filteredOperations.isEmpty)

        opStore.selectedMethods = [.get]
        #expect(opStore.filteredOperations.count == 1)
    }
}
