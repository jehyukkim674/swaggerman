import Foundation

// MARK: - HTTPClient

protocol HTTPClientProtocol: Sendable {
    func get(_ url: URL, headers: [String: String], disableTLS: Bool) async throws -> HTTPResponse
    func execute(_ request: HTTPRequest, disableTLS: Bool) async throws -> HTTPResponse
}

// MARK: - OpenAPIParser

protocol OpenAPIParserProtocol: Sendable {
    func parse(_ data: Data) throws -> ParsedSpec
    func parseYAML(_ string: String) throws -> ParsedSpec
}

// MARK: - SpecCache

struct CachedEntry {
    let spec: ParsedSpec
    let etag: String?
    let cachedAt: Date
    var isUsable: Bool {
        !spec.operations.isEmpty
    }
}

protocol SpecCacheProtocol: Sendable {
    func load(for urlString: String) async -> CachedEntry?
    func store(_ entry: CachedEntry, for urlString: String) async
    func invalidate(for urlString: String) async
    func clear() async
}

// MARK: - KeychainService

protocol KeychainServiceProtocol: Sendable {
    func save(_ value: String, for key: String) throws
    func load(for key: String) throws -> String?
    func delete(for key: String) throws
}
