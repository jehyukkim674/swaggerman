import os.log
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "OperationStore")

@Observable
@MainActor
final class OperationStore {
    private(set) var currentSpec: ParsedSpec?
    private(set) var isLoading = false
    private(set) var loadError: Error?

    var searchText: String = "" {
        didSet { saveFilterState() }
    }

    var selectedMethods: Set<HTTPMethod> = [] {
        didSet { saveFilterState() }
    }

    var selectedTag: String? {
        didSet { saveFilterState() }
    }

    /// Security scheme values entered by user (scheme name → token/value)
    var securityValues: [String: String] = [:] {
        didSet { saveSecurityValues() }
    }

    private var currentProject: Project?
    private var specAuthHeaders: [String: String] = [:]
    var specDisableTLS = false

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
            case let .http(scheme) where scheme.lowercased() == "bearer":
                result["Authorization"] = "Bearer \(value)"
            case let .http(scheme) where scheme.lowercased() == "basic":
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
    let httpClient: HTTPClientProtocol
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
        specDisableTLS = project.disableTLSVerification
        loadError = nil

        guard let url = URL(string: project.swaggerURL) else {
            let err = SwaggerManError.parsing(.invalidJSON("잘못된 URL: \(project.swaggerURL)"))
            loadError = err; throw err
        }

        specAuthHeaders = await (try? buildSpecAuthHeaders(for: project)) ?? [:]

        // Serve cache immediately, then silently refresh in background
        if let cached = await cache.load(for: project.swaggerURL), cached.isUsable {
            currentSpec = cached.spec
            loadSecurityValues(from: project)
            restoreFilterState()
            log.info("Cache hit: \(cached.spec.info.title) — refreshing in background")
            Task { await backgroundRefresh(url: url, urlString: project.swaggerURL, project: project) }
            return
        }

        // No cache — show spinner and wait
        isLoading = true
        defer { isLoading = false }
        do {
            let spec = try await fetchAndParse(url: url)
            await cache.store(CachedEntry(spec: spec, etag: nil, cachedAt: Date()), for: project.swaggerURL)
            currentSpec = spec
            loadSecurityValues(from: project)
            restoreFilterState()
            log.info("Spec loaded: \(spec.info.title) (\(spec.rawOperationCount) ops)")
        } catch {
            loadError = error; throw error
        }
    }

    private func backgroundRefresh(url: URL, urlString: String, project: Project) async {
        do {
            let spec = try await fetchAndParse(url: url)
            await cache.store(CachedEntry(spec: spec, etag: nil, cachedAt: Date()), for: urlString)
            guard project.modelContext != nil else {
                log.info("backgroundRefresh: project removed — skipping spec update")
                return
            }
            if currentProject?.id == project.id {
                currentSpec = spec
                loadSecurityValues(from: project)
            }
            log.info("Background refresh done: \(spec.info.title)")
        } catch {
            log.info("Background refresh failed (cached spec still shown): \(error.localizedDescription)")
        }
    }

    private func loadSecurityValues(from project: Project) {
        guard let json = project.securityValuesJSON,
              let data = json.data(using: .utf8),
              let values = try? JSONDecoder().decode([String: String].self, from: data) else { return }
        securityValues = values
    }

    private func saveSecurityValues() {
        guard let project = currentProject,
              project.modelContext != nil else { return }
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

    private func fetchAndParse(url: URL, allowDiscovery: Bool = true) async throws -> ParsedSpec {
        let response = try await httpClient.get(url, headers: specAuthHeaders, disableTLS: specDisableTLS)
        let bodyStr = String(data: response.body, encoding: .utf8) ?? ""

        if bodyStr.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("<") {
            guard allowDiscovery else {
                throw SwaggerManError.parsing(.invalidJSON("HTML 응답: \(url.path)"))
            }
            return try await discoverSpec(from: url, html: bodyStr)
        }

        if response.statusCode == 401 || response.statusCode == 403 {
            throw SwaggerManError.network(.unauthorizedSwagger)
        }
        if !(200 ..< 300).contains(response.statusCode) {
            throw SwaggerManError.network(.unexpectedStatus(response.statusCode, body: String(bodyStr.prefix(200))))
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

    private enum SpecProbeResult { case found(ParsedSpec); case unauthorized; case miss }

    /// All candidates probed in parallel — returns the first spec that loads successfully.
    private func discoverSpec(from url: URL, html: String) async throws -> ParsedSpec {
        log.info("Auto-discovering spec from \(url) — parallel probe")
        guard var base = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw SwaggerManError.parsing(.invalidJSON("URL 파싱 실패: \(url)"))
        }
        base.query = nil
        let candidates = buildDiscoveryCandidates(base: base, html: html)
        return try await probeAllCandidates(from: url, candidates: candidates)
    }

    private func buildDiscoveryCandidates(base: URLComponents, html: String) -> [URL] {
        var comps = base
        var candidates: [URL] = []
        for extracted in extractSpecURLsFromHTML(html) {
            if extracted.hasPrefix("http") {
                if let url = URL(string: extracted) { candidates.append(url) }
            } else {
                comps.path = extracted
                if let url = comps.url { candidates.append(url) }
            }
        }
        let wellKnown = [
            "/v3/api-docs", "/openapi.json", "/openapi.yaml",
            "/v2/api-docs", "/api-docs", "/swagger.json",
            "/api/schema/", "/api/openapi.json", "/api/swagger.json",
            "/swagger/v1/swagger.json"
        ]
        for path in wellKnown {
            comps.path = path
            if let url = comps.url { candidates.append(url) }
        }
        return candidates
    }

    private func probeSpecURL(_ url: URL) async -> SpecProbeResult {
        do {
            let spec = try await fetchAndParse(url: url, allowDiscovery: false)
            return .found(spec)
        } catch SwaggerManError.network(.unauthorizedSwagger) {
            return .unauthorized
        } catch {
            return .miss
        }
    }

    private func probeAllCandidates(from url: URL, candidates: [URL]) async throws -> ParsedSpec {
        try await withThrowingTaskGroup(of: SpecProbeResult.self) { group in
            group.addTask {
                guard let configURL = await self.swaggerConfigSpecURL(from: url) else { return .miss }
                return await self.probeSpecURL(configURL)
            }
            for candidate in candidates {
                group.addTask { await self.probeSpecURL(candidate) }
            }
            for try await result in group {
                switch result {
                case let .found(spec):
                    group.cancelAll()
                    log.info("Spec discovered (parallel): \(spec.info.title)")
                    return spec
                case .unauthorized:
                    group.cancelAll()
                    throw SwaggerManError.network(.unauthorizedSwagger)
                case .miss:
                    continue
                }
            }
            throw SwaggerManError.parsing(.invalidJSON(
                "HTML 페이지를 받았습니다. JSON spec URL을 직접 입력하세요.\n예: /v3/api-docs, /openapi.json, /api/schema/"
            ))
        }
    }

    private func extractSpecURLsFromHTML(_ html: String) -> [String] {
        var results: [String] = []
        let pattern = #"["\s,{]url\s*:\s*["']([^"']+)["']"#
        if let regex = try? NSRegularExpression(pattern: pattern) {
            let range = NSRange(html.startIndex..., in: html)
            for match in regex.matches(in: html, range: range) {
                if let matchRange = Range(match.range(at: 1), in: html) {
                    let candidate = String(html[matchRange])
                    let lower = candidate.lowercased()
                    let isLikelySpec = lower.hasSuffix(".json") || lower.hasSuffix(".yaml")
                        || lower.hasSuffix(".yml") || lower.contains("api-doc")
                        || lower.contains("openapi") || lower.contains("swagger")
                        || lower.contains("/schema") || lower.contains("/spec")
                    if isLikelySpec { results.append(candidate) }
                }
            }
        }
        return results
    }

    private func swaggerConfigSpecURL(from url: URL) async -> URL? {
        guard var base = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        base.path = "/swagger-ui/swagger-config"
        base.query = nil
        guard let configURL = base.url,
              let response = try? await httpClient.get(configURL, headers: specAuthHeaders, disableTLS: specDisableTLS)
        else { return nil }

        struct SwaggerUIConfig: Decodable { var url: String? }
        guard let config = try? JSONDecoder().decode(SwaggerUIConfig.self, from: response.body),
              let specPath = config.url, !specPath.isEmpty else { return nil }

        if specPath.hasPrefix("http") { return URL(string: specPath) }
        base.path = specPath
        return base.url
    }
}

// MARK: - Filter state persistence

private extension OperationStore {
    private func filterKey() -> String? {
        guard let pid = currentProject?.id else { return nil }
        return "filterState-\(pid.uuidString)"
    }

    func saveFilterState() {
        guard let key = filterKey() else { return }
        let methods = selectedMethods.map(\.rawValue)
        let state: [String: Any] = [
            "searchText": searchText,
            "methods": methods,
            "tag": selectedTag as Any
        ]
        UserDefaults.standard.set(state, forKey: key)
    }

    func restoreFilterState() {
        guard let key = filterKey(),
              let state = UserDefaults.standard.dictionary(forKey: key) else { return }
        searchText = state["searchText"] as? String ?? ""
        let methods = state["methods"] as? [String] ?? []
        selectedMethods = Set(methods.compactMap { HTTPMethod(rawValue: $0) })
        selectedTag = state["tag"] as? String
    }
}
