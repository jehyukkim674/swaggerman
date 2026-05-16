import Foundation
@testable import SwaggerMan

actor MockHTTPClient: HTTPClientProtocol {
    var getResult: Result<HTTPResponse, Error> = .success(
        HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 0)
    )
    var executeResult: Result<HTTPResponse, Error>?

    func setExecuteResult(_ result: Result<HTTPResponse, Error>) {
        executeResult = result
    }

    func get(_ url: URL, headers: [String: String]) async throws -> HTTPResponse {
        try getResult.get()
    }

    func execute(_ request: HTTPRequest) async throws -> HTTPResponse {
        if let executeResult { return try executeResult.get() }
        return try getResult.get()
    }
}

final class MockOpenAPIParser: OpenAPIParserProtocol, @unchecked Sendable {
    var parseResult: Result<ParsedSpec, Error> = .success(MockOpenAPIParser.defaultSpec)

    static let defaultSpec = ParsedSpec(
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
        securitySchemes: [],
        rawOperationCount: 1
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
