import SwiftUI
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "OperationStore")

@Observable
@MainActor
final class OperationStore {
    private(set) var currentSpec: ParsedSpec?
    private(set) var isLoading = false
    private(set) var loadError: Error?

    var searchText: String = ""
    var selectedMethods: Set<HTTPMethod> = []

    var operations: [ParsedOperation] { currentSpec?.operations ?? [] }

    var filteredOperations: [ParsedOperation] {
        operations.filter { op in
            let matchesMethod = selectedMethods.isEmpty || selectedMethods.contains(op.method)
            let matchesSearch = searchText.isEmpty
                || op.path.localizedCaseInsensitiveContains(searchText)
                || (op.summary ?? "").localizedCaseInsensitiveContains(searchText)
                || op.tags.contains { $0.localizedCaseInsensitiveContains(searchText) }
            return matchesMethod && matchesSearch
        }
    }

    var operationsByTag: [(tag: String, operations: [ParsedOperation])] {
        var tagMap: [String: [ParsedOperation]] = [:]
        for op in filteredOperations {
            let tag = op.tags.first ?? "Other"
            tagMap[tag, default: []].append(op)
        }
        return tagMap.sorted { $0.key < $1.key }.map { (tag: $0.key, operations: $0.value) }
    }

    private let parser: OpenAPIParserProtocol
    private let httpClient: HTTPClientProtocol
    private let cache: SpecCacheProtocol

    init(
        parser: OpenAPIParserProtocol = OpenAPIParser(),
        httpClient: HTTPClientProtocol = HTTPClient(),
        cache: SpecCacheProtocol = SpecCache()
    ) {
        self.parser = parser
        self.httpClient = httpClient
        self.cache = cache
    }

    func loadSpec(for project: Project) async throws {
        isLoading = true
        loadError = nil
        defer { isLoading = false }

        guard let url = URL(string: project.swaggerURL) else {
            let err = SwaggerManError.parsing(.invalidJSON("Invalid URL: \(project.swaggerURL)"))
            loadError = err
            throw err
        }

        // Only use cache if it contains full operation data
        if let cached = await cache.load(for: project.swaggerURL), cached.isUsable {
            currentSpec = cached.spec
            log.info("Spec served from cache: \(cached.spec.info.title)")
            return
        }

        do {
            let response = try await httpClient.get(url, headers: [:])
            let spec = try parser.parse(response.body)
            await cache.store(CachedEntry(spec: spec, etag: nil, cachedAt: Date()),
                              for: project.swaggerURL)
            currentSpec = spec
            log.info("Spec loaded: \(spec.info.title) (\(spec.rawOperationCount) ops)")
        } catch {
            loadError = error
            throw error
        }
    }

    func clearSpec() {
        currentSpec = nil
        searchText = ""
        selectedMethods = []
        loadError = nil
    }
}
