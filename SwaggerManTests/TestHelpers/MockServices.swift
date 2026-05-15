import Foundation
@testable import SwaggerMan

final class MockOpenAPIParser: OpenAPIParserProtocol, @unchecked Sendable {
    var parseResult: Result<ParsedSpec, Error> = .success(
        ParsedSpec(
            info: SpecInfo(title: "Mock", version: "1.0", description: nil),
            servers: ["https://mock.api.com"],
            operations: [
                ParsedOperation(
                    id: "GET /users",
                    method: .get,
                    path: "/users",
                    operationId: "listUsers",
                    summary: "List users",
                    description: nil,
                    tags: ["Users"],
                    parameters: [],
                    requestBody: nil,
                    responseDescriptions: ["200": "Success"]
                )
            ],
            rawOperationCount: 1
        )
    )

    func parse(_ data: Data) throws -> ParsedSpec {
        try parseResult.get()
    }

    func parseYAML(_ string: String) throws -> ParsedSpec {
        try parseResult.get()
    }
}

actor MockSpecCache: SpecCacheProtocol {
    var storedEntries: [String: CachedEntry] = [:]
    var loadCallCount = 0
    var storeCallCount = 0

    func load(for urlString: String) -> CachedEntry? {
        loadCallCount += 1
        return storedEntries[urlString]
    }

    func store(_ entry: CachedEntry, for urlString: String) {
        storeCallCount += 1
        storedEntries[urlString] = entry
    }

    func invalidate(for urlString: String) {
        storedEntries.removeValue(forKey: urlString)
    }

    func clear() {
        storedEntries.removeAll()
    }
}
