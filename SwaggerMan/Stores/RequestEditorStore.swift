// swiftlint:disable file_length type_body_length
import Foundation
import os.log
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "RequestEditorStore")

private struct PersistedEditorState: Codable {
    struct Param: Codable { var key: String; var value: String; var enabled: Bool }
    var headers: [Param]
    var queryParams: [Param]
    var pathParams: [String: String]
    var bodyJSON: String
}

struct RequestParam: Identifiable, Equatable {
    var id = UUID()
    var key: String
    var value: String
    var enabled: Bool = true
    var isFromSpec: Bool = false
    var isRequired: Bool = false
}

enum ResponseTab { case docs, response }

@Observable
@MainActor
final class RequestEditorStore {
    // MARK: - Public

    private(set) var selectedOperation: ParsedOperation?
    private(set) var currentBaseURL: String = ""
    private(set) var currentEnvID: UUID = .init()

    var pathParams: [String: String] = [:] {
        didSet { if !isLoadingOperation { persistCurrentState() } }
    }

    var queryParams: [RequestParam] = [] {
        didSet { if !isLoadingOperation { persistCurrentState() } }
    }

    var requestHeaders: [RequestParam] = [] {
        didSet { if !isLoadingOperation { persistCurrentState() } }
    }

    var bodyJSON: String = "" {
        didSet { if !isLoadingOperation { persistCurrentState() } }
    }

    private(set) var isSending = false
    private(set) var response: HTTPResponse?
    private(set) var sendError: Error?
    private(set) var lastCurlString: String?
    private(set) var lastRequest: HTTPRequest?

    private(set) var currentProjectID: UUID?
    var responseTab: ResponseTab = .docs

    // MARK: - Private

    private let httpClient: HTTPClientProtocol
    @ObservationIgnored private var stateLoadedFromHistory = false
    @ObservationIgnored private var isLoadingOperation = false
    @ObservationIgnored private var sendTask: Task<Void, Never>?

    init(httpClient: HTTPClientProtocol = HTTPClient()) {
        self.httpClient = httpClient
    }

    // MARK: - Public Methods

    func loadOperation(_ op: ParsedOperation, baseURL: String, environment: APIEnvironment,
                       securityHeaders: [String: String] = [:], projectID: UUID? = nil)
    {
        // Save current state before resetting (skip if state was loaded from history)
        if !stateLoadedFromHistory, let pid = currentProjectID, let cur = selectedOperation {
            persistEditorState(projectID: pid, operationID: cur.id)
        }
        stateLoadedFromHistory = false

        isLoadingOperation = true
        responseTab = .docs
        defer { isLoadingOperation = false }

        if let pid = projectID { currentProjectID = pid }
        selectedOperation = op
        currentBaseURL = baseURL
        currentEnvID = environment.id
        response = nil
        sendError = nil
        lastCurlString = nil
        lastRequest = nil

        // 같은 이름의 path 파라미터가 중복으로 정의된(비정상) 스펙에서도 크래시하지 않도록 병합
        pathParams = Dictionary(
            op.parameters.filter { $0.location == .path }.map { ($0.name, "") },
            uniquingKeysWith: { first, _ in first }
        )
        queryParams = op.parameters
            .filter { $0.location == .query }
            .map { RequestParam(key: $0.name, value: "", enabled: true) }
        requestHeaders = buildDefaultHeaders(for: op, environment: environment, securityHeaders: securityHeaders)
        bodyJSON = op.requestBody != nil ? "{}" : ""

        // Restore persisted user edits for this operation
        if let pid = currentProjectID {
            restoreEditorState(projectID: pid, operationID: op.id)
        }
    }

    func clearSelection() {
        // Save before clearing (skip history state)
        if !stateLoadedFromHistory, let pid = currentProjectID, let op = selectedOperation {
            persistEditorState(projectID: pid, operationID: op.id)
        }
        stateLoadedFromHistory = false

        isLoadingOperation = true
        defer { isLoadingOperation = false }

        selectedOperation = nil
        currentBaseURL = ""
        currentEnvID = UUID()
        pathParams = [:]
        queryParams = []
        requestHeaders = []
        bodyJSON = ""
        response = nil
        sendError = nil
        lastCurlString = nil
        lastRequest = nil
    }

    func persistCurrentState() {
        guard !isLoadingOperation else { return }
        guard let pid = currentProjectID, let op = selectedOperation else { return }
        persistEditorState(projectID: pid, operationID: op.id)
    }

    /// 요청을 백그라운드 Task로 시작한다(취소 가능, UI 논블로킹). 실제 수행은 `performSend`.
    func send(project: Project, historyStore: HistoryStore, disableTLS: Bool = false,
              securityHeaders: [String: String] = [:])
    {
        guard selectedOperation != nil else {
            log.warning("send 무시 — 선택된 operation 없음")
            return
        }
        sendTask?.cancel()
        sendTask = Task { [weak self] in
            await self?.performSend(project: project, historyStore: historyStore,
                                    disableTLS: disableTLS, securityHeaders: securityHeaders)
        }
    }

    /// 실제 요청 수행. `send`가 Task로 감싸 호출하며, 테스트에서는 직접 await 한다.
    func performSend(project: Project, historyStore: HistoryStore, disableTLS: Bool = false,
                     securityHeaders: [String: String] = [:]) async
    {
        guard let op = selectedOperation else {
            log.warning("performSend 무시 — 선택된 operation 없음")
            return
        }
        isSending = true
        defer { isSending = false }
        sendError = nil

        do {
            let request = try buildRequest(op: op, securityHeaders: securityHeaders)
            lastCurlString = CurlBuilder.build(request)
            lastRequest = request
            log.info("요청 시작: \(op.method.rawValue) \(request.url.absoluteString) (disableTLS=\(disableTLS))")
            let res = try await httpClient.execute(request, disableTLS: disableTLS)
            try Task.checkCancellation()
            response = res
            responseTab = .response

            guard project.modelContext != nil else {
                log.warning("send: project removed during request — response shown, history skipped")
                return
            }

            let reqHeadersJSON = jsonString(from: request.headers)
            let resHeadersJSON = jsonString(from: res.headers)
            let bodyStr = res.bodyString ?? ""
            let truncatedBody = bodyStr.count > 1_000_000
                ? String(bodyStr.prefix(1_000_000)) + "\n...(truncated)"
                : bodyStr

            let item = HistoryItem(
                environmentID: currentEnvID,
                method: op.method.rawValue,
                path: op.path,
                fullURL: request.url.absoluteString,
                requestHeadersJSON: reqHeadersJSON,
                requestBody: request.body.flatMap { String(data: $0, encoding: .utf8) },
                responseStatus: res.statusCode,
                responseHeadersJSON: resHeadersJSON,
                responseBody: truncatedBody,
                responseSize: res.body.count,
                durationMs: res.durationMs,
                project: project
            )
            historyStore.append(item, to: project)
            log.info("요청 완료: \(op.method.rawValue) \(op.path) → \(res.statusCode) (\(res.durationMs)ms)")
        } catch is CancellationError {
            log.info("요청 취소됨: \(op.method.rawValue) \(op.path)")
        } catch {
            sendError = error
            responseTab = .response
            log.error("요청 실패: \(op.method.rawValue) \(op.path) — \(error.localizedDescription)")
        }
    }

    func cancelSend() {
        sendTask?.cancel()
        sendTask = nil
        isSending = false
    }

    func loadFromHistory(_ item: HistoryItem, operation: ParsedOperation,
                         environment: APIEnvironment, securityHeaders: [String: String],
                         projectID: UUID? = nil)
    {
        loadOperation(operation, baseURL: environment.baseURL, environment: environment,
                      securityHeaders: securityHeaders, projectID: projectID)
        isLoadingOperation = true
        defer { isLoadingOperation = false }
        restoreParams(from: item)
        stateLoadedFromHistory = true
        response = HTTPResponse(
            statusCode: item.responseStatus,
            headers: decodeStringDict(item.responseHeadersJSON),
            body: item.responseBody.data(using: .utf8) ?? Data(),
            durationMs: item.durationMs
        )
        lastCurlString = nil
        lastRequest = nil
        // 저장된 응답을 바로 볼 수 있도록 Response 탭으로 전환
        responseTab = .response
        log.info("히스토리 로드: \(item.method) \(item.path) → \(item.responseStatus)")
    }

    func restoreParams(from item: HistoryItem) {
        if let body = item.requestBody {
            bodyJSON = body
        }
        let headers = decodeStringDict(item.requestHeadersJSON)
        // isFromSpec/isRequired metadata is not persisted in HistoryItem; restored headers appear as user-defined.
        requestHeaders = headers.map { RequestParam(key: $0.key, value: $0.value, enabled: true) }
        // 실제 보냈던 path/query 파라미터 값을 fullURL에서 복원
        restorePathAndQuery(fromFullURL: item.fullURL)
    }

    /// 히스토리의 fullURL에서 실제 요청에 사용된 path/query 파라미터 값을 복원한다.
    /// (HistoryItem은 fullURL만 저장하므로 path param {id}=값, query를 역으로 추출)
    private func restorePathAndQuery(fromFullURL fullURL: String) {
        guard let components = URLComponents(string: fullURL) else {
            log.warning("restorePathAndQuery: fullURL 파싱 실패 — \(fullURL)")
            return
        }

        // Query 파라미터 복원 (히스토리에 있던 쿼리만 값 채움)
        let historyQuery = components.queryItems ?? []
        if !historyQuery.isEmpty {
            var historyMap: [String: String] = [:]
            for queryItem in historyQuery {
                historyMap[queryItem.name] = queryItem.value ?? ""
            }
            queryParams = queryParams.map { param in
                guard let value = historyMap[param.key] else { return param }
                return RequestParam(key: param.key, value: value, enabled: true,
                                    isFromSpec: param.isFromSpec, isRequired: param.isRequired)
            }
            let existing = Set(queryParams.map(\.key))
            for queryItem in historyQuery where !existing.contains(queryItem.name) {
                queryParams.append(RequestParam(key: queryItem.name, value: queryItem.value ?? "", enabled: true))
            }
        }

        // Path 파라미터 복원: op.path 템플릿을 실제 경로의 끝에 정렬해 {param} 위치의 값을 추출
        guard let op = selectedOperation else { return }
        let templateSegments = op.path.split(separator: "/").map(String.init)
        let actualSegments = components.path.split(separator: "/").map(String.init)
        guard actualSegments.count >= templateSegments.count else { return }
        let offset = actualSegments.count - templateSegments.count
        for (index, segment) in templateSegments.enumerated()
            where segment.hasPrefix("{") && segment.hasSuffix("}")
        {
            let name = String(segment.dropFirst().dropLast())
            let rawValue = actualSegments[offset + index]
            pathParams[name] = rawValue.removingPercentEncoding ?? rawValue
        }
    }

    // MARK: - Private Methods

    private func buildRequest(op: ParsedOperation, securityHeaders: [String: String] = [:]) throws -> HTTPRequest {
        var path = op.path
        for (key, value) in pathParams {
            let encoded = value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
            path = path.replacingOccurrences(of: "{\(key)}", with: encoded)
        }

        guard var components = URLComponents(string: currentBaseURL + path) else {
            throw SwaggerManError.validation(.requiredFieldMissing("URL"))
        }

        let enabledQuery = queryParams.filter { $0.enabled && !$0.value.isEmpty }
        if !enabledQuery.isEmpty {
            components.queryItems = enabledQuery.map { URLQueryItem(name: $0.key, value: $0.value) }
        }

        guard let url = components.url else {
            throw SwaggerManError.validation(.requiredFieldMissing("URL"))
        }

        var headers: [String: String] = [:]
        for header in requestHeaders where header.enabled && !header.key.isEmpty && !header.value.isEmpty {
            headers[header.key] = header.value
        }
        // Fresh security headers override stale values from loadOperation time
        for (key, value) in securityHeaders where !value.isEmpty {
            headers[key] = value
        }
        log.debug("buildRequest headers: \(headers.map { "\($0.key)=\($0.value.prefix(20))" }.joined(separator: ", "))")

        var body: Data?
        let trimmedBody = bodyJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedBody.isEmpty {
            body = trimmedBody.data(using: .utf8)
            if headers["Content-Type"] == nil, op.requestBody != nil {
                headers["Content-Type"] = "application/json"
            }
        }

        return HTTPRequest(method: op.method, url: url, headers: headers, body: body)
    }

    private func buildDefaultHeaders(for op: ParsedOperation, environment: APIEnvironment,
                                     securityHeaders: [String: String] = [:]) -> [RequestParam]
    {
        var headers: [RequestParam] = []

        // Security scheme values (from Authorize dialog) take priority
        for (key, value) in securityHeaders {
            headers.append(RequestParam(key: key, value: value, enabled: true))
        }

        // Environment-level auth (only if no security scheme already set Authorization)
        let hasAuth = securityHeaders.keys.contains { $0.lowercased() == "authorization" }
        if !hasAuth {
            switch environment.authScheme {
            case .bearer:
                let token = environment.bearerToken ?? ""
                headers.append(RequestParam(
                    key: "Authorization",
                    value: token.isEmpty ? "Bearer " : "Bearer \(token)",
                    enabled: !token.isEmpty
                ))
            case .basic:
                let user = environment.basicUsername ?? ""
                let pass = environment.basicPassword ?? ""
                let encoded = Data("\(user):\(pass)".utf8).base64EncodedString()
                headers.append(RequestParam(
                    key: "Authorization",
                    value: user.isEmpty ? "Basic " : "Basic \(encoded)",
                    enabled: !user.isEmpty
                ))
            case .apiKey:
                let keyName = environment.apiKeyHeaderName ?? "X-API-Key"
                let keyValue = environment.apiKeyValue ?? ""
                if environment.apiKeyInQuery != true {
                    headers.append(RequestParam(key: keyName, value: keyValue, enabled: !keyValue.isEmpty))
                }
            case .none:
                break
            }
        } // end if !hasAuth

        // Spec-defined header parameters
        for param in op.parameters where param.location == .header {
            let alreadySet = headers.contains { $0.key.lowercased() == param.name.lowercased() }
            if !alreadySet {
                headers.append(RequestParam(
                    key: param.name, value: "", enabled: param.required,
                    isFromSpec: true, isRequired: param.required
                ))
            }
        }

        if op.requestBody != nil {
            headers.append(RequestParam(key: "Content-Type", value: "application/json", enabled: true))
        }
        headers.append(RequestParam(key: "Accept", value: "application/json", enabled: true))
        return headers
    }

    private func jsonString(from dict: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: .sortedKeys),
              let str = String(data: data, encoding: .utf8) else { return "{}" }
        return str
    }

    private func decodeStringDict(_ json: String) -> [String: String] {
        (try? JSONDecoder().decode([String: String].self, from: Data(json.utf8))) ?? [:]
    }

    // MARK: - Editor State Persistence

    private func persistEditorState(projectID: UUID, operationID: String) {
        let state = PersistedEditorState(
            headers: requestHeaders.map { .init(key: $0.key, value: $0.value, enabled: $0.enabled) },
            queryParams: queryParams.map { .init(key: $0.key, value: $0.value, enabled: $0.enabled) },
            pathParams: pathParams,
            bodyJSON: bodyJSON
        )
        let key = "editorState-\(projectID.uuidString)-\(operationID)"
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: key)
            log.debug("PERSIST [\(operationID)] headers=\(state.headers.map(\.key))")
        }
    }

    @discardableResult
    private func restoreEditorState(projectID: UUID, operationID: String) -> Bool {
        let key = "editorState-\(projectID.uuidString)-\(operationID)"
        guard let data = UserDefaults.standard.data(forKey: key),
              let state = try? JSONDecoder().decode(PersistedEditorState.self, from: data)
        else {
            log.debug("RESTORE [\(operationID)] — no saved state")
            return false
        }
        log.debug("RESTORE [\(operationID)] headers=\(state.headers.map(\.key))")

        // Merge saved values into spec-derived params (preserve isFromSpec/isRequired metadata)
        // 빈 키/중복 키(중복 쿼리·헤더 파라미터)에서도 크래시하지 않도록 마지막 값 우선으로 병합
        let savedQueryMap = Dictionary(state.queryParams.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
        queryParams = queryParams.map { param in
            guard let saved = savedQueryMap[param.key] else { return param }
            return RequestParam(key: param.key, value: saved.value, enabled: saved.enabled,
                                isFromSpec: param.isFromSpec, isRequired: param.isRequired)
        }

        // Merge headers: update existing spec headers, append any user-added ones
        let savedHeaderMap = Dictionary(state.headers.map { ($0.key, $0) }, uniquingKeysWith: { _, last in last })
        requestHeaders = requestHeaders.map { param in
            guard let saved = savedHeaderMap[param.key] else { return param }
            return RequestParam(key: param.key, value: saved.value, enabled: saved.enabled,
                                isFromSpec: param.isFromSpec, isRequired: param.isRequired)
        }
        let existingHeaderKeys = Set(requestHeaders.map(\.key))
        for saved in state.headers where !existingHeaderKeys.contains(saved.key) {
            requestHeaders.append(RequestParam(key: saved.key, value: saved.value, enabled: saved.enabled))
        }

        pathParams = state.pathParams
        bodyJSON = state.bodyJSON
        return true
    }
}

// swiftlint:enable file_length type_body_length
