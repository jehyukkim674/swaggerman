import os.log
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "OperationStore")

@Observable
@MainActor
final class OperationStore {
    private(set) var currentSpec: ParsedSpec?
    private(set) var isLoading = false
    private(set) var loadError: Error?

    var searchText: String = ""
    var selectedMethods: Set<HTTPMethod> = []
    var selectedTag: String?

    /// Security scheme values entered by user (scheme name → token/value)
    var securityValues: [String: String] = [:] {
        didSet { saveSecurityValues() }
    }

    private var currentProject: Project?

    var securitySchemes: [ParsedSecurityScheme] {
        currentSpec?.securitySchemes ?? []
    }

    /// Maps header-name → value, computed from securityValues + scheme definitions
    var computedSecurityHeaders: [String: String] {
        var result: [String: String] = [:]
        for scheme in securitySchemes {
            guard let value = securityValues[scheme.name], !value.isEmpty else { continue }
            switch scheme.kind {
            case let .apiKey(name, location) where location == "header":
                result[name] = value
            case let .http(s) where s.lowercased() == "bearer":
                result["Authorization"] = "Bearer \(value)"
            case let .http(s) where s.lowercased() == "basic":
                result["Authorization"] = "Basic \(value)"
            default:
                break
            }
        }
        return result
    }

    var operations: [ParsedOperation] {
        currentSpec?.operations ?? []
    }

    var availableTags: [String] {
        var seen = Set<String>()
        var tags: [String] = []
        for op in operations {
            let tag = op.tags.first ?? "Other"
            if seen.insert(tag).inserted { tags.append(tag) }
        }
        return tags.sorted()
    }

    var filteredOperations: [ParsedOperation] {
        operations.filter { op in
            let matchesMethod = selectedMethods.isEmpty || selectedMethods.contains(op.method)
            let matchesSearch = searchText.isEmpty
                || op.path.localizedCaseInsensitiveContains(searchText)
                || (op.summary ?? "").localizedCaseInsensitiveContains(searchText)
                || op.tags.contains { $0.localizedCaseInsensitiveContains(searchText) }
            let matchesTag: Bool = if let tag = selectedTag {
                (op.tags.first ?? "Other") == tag
            } else {
                true
            }
            return matchesMethod && matchesSearch && matchesTag
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
        currentProject = project
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
            loadSecurityValues(from: project)
            log.info("Spec loaded: \(spec.info.title) (\(spec.rawOperationCount) ops)")
        } catch {
            loadError = error
            throw error
        }
    }

    private func loadSecurityValues(from project: Project) {
        guard let json = project.securityValuesJSON,
              let data = json.data(using: .utf8),
              let values = try? JSONDecoder().decode([String: String].self, from: data) else { return }
        securityValues = values
    }

    private func saveSecurityValues() {
        guard let project = currentProject else { return }
        if let data = try? JSONEncoder().encode(securityValues),
           let json = String(data: data, encoding: .utf8)
        {
            project.securityValuesJSON = json.isEmpty ? nil : json
        }
    }

    func clearSpec() {
        currentProject = nil
        currentSpec = nil
        searchText = ""
        selectedMethods = []
        selectedTag = nil
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

    /// Swagger UI URL → try swagger-config, then common spec paths
    private func discoverSpec(from url: URL) async throws -> ParsedSpec {
        log.info("HTML received — auto-discovering spec URL from \(url)")

        if let specURL = await swaggerConfigSpecURL(from: url),
           let spec = try? await fetchAndParse(url: specURL)
        {
            log.info("Spec discovered via swagger-config: \(specURL)")
            return spec
        }

        guard var base = URLComponents(url: url, resolvingAgainstBaseURL: false)
        else {
            throw SwaggerManError.parsing(.invalidJSON("URL 파싱 실패: \(url)"))
        }
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
        guard var base = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
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
