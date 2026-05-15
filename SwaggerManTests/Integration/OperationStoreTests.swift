import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("OperationStore Tests", .serialized)
@MainActor
struct OperationStoreTests {

    func makeStore(parser: OpenAPIParserProtocol = MockOpenAPIParser()) throws -> (OperationStore, ProjectStore, _container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let cache = SpecCache(cacheDirectory: FileManager.default.temporaryDirectory
            .appendingPathComponent("OpStoreTests-\(UUID().uuidString)"))
        let http = HTTPClient(session: .mock())
        let opStore = OperationStore(parser: parser, cache: cache, httpClient: http)
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
