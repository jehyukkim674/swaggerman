import SwiftUI
import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "RequestEditorStore")

struct RequestParam: Identifiable {
    var id = UUID()
    var key: String
    var value: String
    var enabled: Bool = true
}

@Observable
@MainActor
final class RequestEditorStore {
    // MARK: - Public

    private(set) var selectedOperation: ParsedOperation?
    private(set) var currentBaseURL: String = ""
    private(set) var currentEnvID: UUID = UUID()

    var pathParams: [String: String] = [:]
    var queryParams: [RequestParam] = []
    var requestHeaders: [RequestParam] = []
    var bodyJSON: String = ""

    private(set) var isSending = false
    private(set) var response: HTTPResponse?
    private(set) var sendError: Error?
    private(set) var lastCurlString: String?

    // MARK: - Private

    private let httpClient: HTTPClientProtocol

    init(httpClient: HTTPClientProtocol = HTTPClient()) {
        self.httpClient = httpClient
    }

    // MARK: - Public Methods

    func loadOperation(_ op: ParsedOperation, baseURL: String, envID: UUID) {
        selectedOperation = op
        currentBaseURL = baseURL
        currentEnvID = envID
        response = nil
        sendError = nil
        lastCurlString = nil

        pathParams = Dictionary(uniqueKeysWithValues:
            op.parameters.filter { $0.location == .path }.map { ($0.name, "") }
        )
        queryParams = op.parameters
            .filter { $0.location == .query }
            .map { RequestParam(key: $0.name, value: "", enabled: true) }
        requestHeaders = []
        bodyJSON = op.requestBody != nil ? "{}" : ""
    }

    func clearSelection() {
        selectedOperation = nil
        pathParams = [:]
        queryParams = []
        requestHeaders = []
        bodyJSON = ""
        response = nil
        sendError = nil
        lastCurlString = nil
    }

    func send(project: Project, historyStore: HistoryStore) async {
        guard let op = selectedOperation else { return }
        isSending = true
        sendError = nil
        defer { isSending = false }

        do {
            let request = try buildRequest(op: op)
            lastCurlString = CurlBuilder.build(request)
            response = try await httpClient.execute(request)

            let reqHeadersJSON = jsonString(from: request.headers)
            let resHeadersJSON = jsonString(from: response!.headers)
            let bodyStr = response!.bodyString ?? ""
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
                responseStatus: response!.statusCode,
                responseHeadersJSON: resHeadersJSON,
                responseBody: truncatedBody,
                responseSize: response!.body.count,
                durationMs: response!.durationMs,
                project: project
            )
            historyStore.append(item, to: project)
            log.info("Request sent: \(op.method.rawValue) \(op.path) → \(self.response!.statusCode)")
        } catch {
            sendError = error
            log.error("Request failed: \(error.localizedDescription)")
        }
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
        for h in requestHeaders where h.enabled && !h.key.isEmpty {
            headers[h.key] = h.value
        }

        var body: Data?
        let trimmedBody = bodyJSON.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedBody.isEmpty {
            body = trimmedBody.data(using: .utf8)
            if headers["Content-Type"] == nil && op.requestBody != nil {
                headers["Content-Type"] = "application/json"
            }
        }

        return HTTPRequest(method: op.method, url: url, headers: headers, body: body)
    }

    private func jsonString(from dict: [String: String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict, options: .sortedKeys),
              let str = String(data: data, encoding: .utf8) else { return "{}" }
        return str
    }
}
