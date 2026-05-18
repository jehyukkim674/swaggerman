import Foundation
@testable import SwaggerMan

actor MockHTTPClient: HTTPClientProtocol {
    var getResult: Result<HTTPResponse, Error> = .success(
        HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 0)
    )
    var executeResult: Result<HTTPResponse, Error>?
    var urlBasedResults: [String: Result<HTTPResponse, Error>] = [:]
    var lastDisableTLS: Bool = false

    func setExecuteResult(_ result: Result<HTTPResponse, Error>) {
        executeResult = result
    }

    func setURLResult(for urlString: String, _ result: Result<HTTPResponse, Error>) {
        urlBasedResults[urlString] = result
    }

    func get(_ url: URL, headers _: [String: String], disableTLS: Bool = false) async throws -> HTTPResponse {
        lastDisableTLS = disableTLS
        if let result = urlBasedResults[url.absoluteString] {
            return try result.get()
        }
        return try getResult.get()
    }

    func execute(_: HTTPRequest, disableTLS: Bool = false) async throws -> HTTPResponse {
        lastDisableTLS = disableTLS
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
                responses: [ParsedResponse(statusCode: "200", description: "Success", schema: nil)]
            )
        ],
        securitySchemes: [],
        rawOperationCount: 1
    )

    func parse(_: Data) throws -> ParsedSpec {
        try parseResult.get()
    }

    func parseYAML(_: String) throws -> ParsedSpec {
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
