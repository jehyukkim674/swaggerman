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

struct RequestParam: Identifiable {
    var id = UUID()
    var key: String
    var value: String
    var enabled: Bool = true
    var isFromSpec: Bool = false
    var isRequired: Bool = false
}

@Observable
@MainActor
final class RequestEditorStore {
    // MARK: - Public

    private(set) var selectedOperation: ParsedOperation?
    private(set) var currentBaseURL: String = ""
    private(set) var currentEnvID: UUID = .init()

    var pathParams: [String: String] = [:]
    var queryParams: [RequestParam] = []
    var requestHeaders: [RequestParam] = []
    var bodyJSON: String = ""

    private(set) var isSending = false
    private(set) var response: HTTPResponse?
    private(set) var sendError: Error?
    private(set) var lastCurlString: String?
    private(set) var lastRequest: HTTPRequest?

    private(set) var currentProjectID: UUID?

    // MARK: - Private

    private let httpClient: HTTPClientProtocol
    @ObservationIgnored private var stateLoadedFromHistory = false

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

        if let pid = projectID { currentProjectID = pid }
        selectedOperation = op
        currentBaseURL = baseURL
        currentEnvID = environment.id
        response = nil
        sendError = nil
        lastCurlString = nil
        lastRequest = nil

        pathParams = Dictionary(uniqueKeysWithValues:
            op.parameters.filter { $0.location == .path }.map { ($0.name, "") })
        queryParams = op.parameters
            .filter { $0.location == .query }
            .map { RequestParam(key: $0.name, value: "", enabled: true) }
        requestHeaders = buildDefaultHeaders(for: op, environment: environment, securityHeaders: securityHeaders)
        bodyJSON = op.requestBody != nil ? "{}" : ""

        // Restore persisted user edits for this operation
        if let pid = currentProjectID {
            _ = restoreEditorState(projectID: pid, operationID: op.id)
        }
    }

    func clearSelection() {
        // Save before clearing (skip history state)
        if !stateLoadedFromHistory, let pid = currentProjectID, let op = selectedOperation {
            persistEditorState(projectID: pid, operationID: op.id)
        }
        stateLoadedFromHistory = false

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
        guard let pid = currentProjectID, let op = selectedOperation else { return }
        persistEditorState(projectID: pid, operationID: op.id)
    }

    func send(project: Project, historyStore: HistoryStore, disableTLS: Bool = false) async {
        guard let op = selectedOperation else { return }
        isSending = true
        defer { isSending = false }
        sendError = nil

        do {
            let request = try buildRequest(op: op)
            lastCurlString = CurlBuilder.build(request)
            lastRequest = request
            let res = try await httpClient.execute(request, disableTLS: disableTLS)
            response = res

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
            log.info("Request sent: \(op.method.rawValue) \(op.path) → \(res.statusCode)")
        } catch {
            sendError = error
            log.error("Request failed: \(error.localizedDescription)")
        }
    }

    func loadFromHistory(_ item: HistoryItem, operation: ParsedOperation,
                         environment: APIEnvironment, securityHeaders: [String: String],
                         projectID: UUID? = nil)
    {
        loadOperation(operation, baseURL: environment.baseURL, environment: environment,
                      securityHeaders: securityHeaders, projectID: projectID)
        restoreParams(from: item)
        stateLoadedFromHistory = true
        response = HTTPResponse(
            statusCode: item.responseStatus,
            headers: decodeStringDict(item.responseHeadersJSON),
            body: item.responseBody.data(using: .utf8) ?? Data(),
            durationMs: item.durationMs
        )
    }

    func restoreParams(from item: HistoryItem) {
        if let body = item.requestBody {
            bodyJSON = body
        }
        let headers = decodeStringDict(item.requestHeadersJSON)
        // isFromSpec/isRequired metadata is not persisted in HistoryItem; restored headers appear as user-defined.
        requestHeaders = headers.map { RequestParam(key: $0.key, value: $0.value, enabled: true) }
    }

    // MARK: - Private Methods

    private func buildRequest(op: ParsedOperation) throws -> HTTPRequest {
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
        for header in requestHeaders where header.enabled && !header.key.isEmpty {
            headers[header.key] = header.value
        }

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
        }
    }

    @discardableResult
    private func restoreEditorState(projectID: UUID, operationID: String) -> Bool {
        let key = "editorState-\(projectID.uuidString)-\(operationID)"
        guard let data = UserDefaults.standard.data(forKey: key),
              let state = try? JSONDecoder().decode(PersistedEditorState.self, from: data)
        else {
            return false
        }
        requestHeaders = state.headers.map {
            RequestParam(key: $0.key, value: $0.value, enabled: $0.enabled)
        }
        queryParams = state.queryParams.map {
            RequestParam(key: $0.key, value: $0.value, enabled: $0.enabled)
        }
        pathParams = state.pathParams
        bodyJSON = state.bodyJSON
        return true
    }
}
