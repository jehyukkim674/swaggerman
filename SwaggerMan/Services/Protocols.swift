import Foundation

// MARK: - HTTPClient

protocol HTTPClientProtocol: Sendable {
    func get(_ url: URL, headers: [String: String]) async throws -> HTTPResponse
    func execute(_ request: HTTPRequest) async throws -> HTTPResponse
}

// MARK: - OpenAPIParser

protocol OpenAPIParserProtocol: Sendable {
    func parse(_ data: Data) throws -> ParsedSpec
    func parseYAML(_ string: String) throws -> ParsedSpec
}

// MARK: - SpecCache

struct CachedEntry: Sendable {
    let spec: ParsedSpec
    let etag: String?
    let cachedAt: Date
}

protocol SpecCacheProtocol: Sendable {
    func load(for urlString: String) -> CachedEntry?
    func store(_ entry: CachedEntry, for urlString: String)
    func invalidate(for urlString: String)
    func clear()
}

// MARK: - KeychainService

protocol KeychainServiceProtocol: Sendable {
    func save(_ value: String, for key: String) throws
    func load(for key: String) throws -> String?
    func delete(for key: String) throws
}
