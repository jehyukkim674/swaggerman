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

    // Security scheme values entered by user (scheme name → token/value)
    var securityValues: [String: String] = [:]

    var securitySchemes: [ParsedSecurityScheme] { currentSpec?.securitySchemes ?? [] }

    // Maps header-name → value, computed from securityValues + scheme definitions
    var computedSecurityHeaders: [String: String] {
        var result: [String: String] = [:]
        for scheme in securitySchemes {
            guard let value = securityValues[scheme.name], !value.isEmpty else { continue }
            switch scheme.kind {
            case .apiKey(let name, let location) where location == "header":
                result[name] = value
            case .http(let s) where s.lowercased() == "bearer":
                result["Authorization"] = "Bearer \(value)"
            case .http(let s) where s.lowercased() == "basic":
                result["Authorization"] = "Basic \(value)"
            default:
                break
            }
        }
        return result
    }

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
            let err = SwaggerManError.parsing(.invalidJSON("잘못된 URL: \(project.swaggerURL)"))
            loadError = err
            throw err
        }

        if let cached = await cache.load(for: project.swaggerURL), cached.isUsable {
            currentSpec = cached.spec
            log.info("Spec served from cache: \(cached.spec.info.title)")
            return
        }

        do {
            let spec = try await fetchAndParse(url: url)
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
        securityValues = [:]
    }

    // MARK: - Private

    private func fetchAndParse(url: URL) async throws -> ParsedSpec {
        let response = try await httpClient.get(url, headers: [:])
        let bodyStr = String(data: response.body, encoding: .utf8) ?? ""

        if bodyStr.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<") {
            // HTML received — try to auto-discover the real spec URL
            return try await discoverSpec(from: url)
        }

        return try parseBody(response.body, bodyStr: bodyStr,
                             contentType: response.headers["Content-Type"] ?? response.headers["content-type"] ?? "")
    }

    private func parseBody(_ data: Data, bodyStr: String, contentType: String) throws -> ParsedSpec {
        let isYAML = contentType.contains("yaml")
            || bodyStr.hasPrefix("openapi:")
            || bodyStr.hasPrefix("swagger:")
        if isYAML {
            return try parser.parseYAML(bodyStr)
        }
        return try parser.parse(data)
    }

    // Swagger UI URL → try swagger-config, then common spec paths
    private func discoverSpec(from url: URL) async throws -> ParsedSpec {
        log.info("HTML received — auto-discovering spec URL from \(url)")

        if let specURL = await swaggerConfigSpecURL(from: url),
           let spec = try? await fetchAndParse(url: specURL) {
            log.info("Spec discovered via swagger-config: \(specURL)")
            return spec
        }

        var base = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        base.query = nil
        let candidates = ["/v3/api-docs", "/openapi.json", "/api/schema/", "/api-docs", "/swagger.json"]
        for path in candidates {
            base.path = path
            guard let candidate = base.url else { continue }
            if let spec = try? await fetchAndParse(url: candidate) {
                log.info("Spec discovered at: \(candidate)")
                return spec
            }
        }

        throw SwaggerManError.parsing(.invalidJSON(
            "HTML 페이지를 받았습니다. JSON spec URL을 직접 입력하세요.\n예: /v3/api-docs, /openapi.json, /api/schema/"
        ))
    }

    private func swaggerConfigSpecURL(from url: URL) async -> URL? {
        var base = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        base.path = "/swagger-ui/swagger-config"
        base.query = nil
        guard let configURL = base.url,
              let response = try? await httpClient.get(configURL, headers: [:]) else { return nil }

        struct SwaggerUIConfig: Decodable { var url: String? }
        guard let config = try? JSONDecoder().decode(SwaggerUIConfig.self, from: response.body),
              let specPath = config.url, !specPath.isEmpty else { return nil }

        if specPath.hasPrefix("http") { return URL(string: specPath) }
        base.path = specPath
        return base.url
    }
}
