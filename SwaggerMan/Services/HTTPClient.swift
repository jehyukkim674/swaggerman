import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "HTTPClient")

actor HTTPClient: HTTPClientProtocol {
    private let session: URLSession

    nonisolated init(session: URLSession = .shared) {
        self.session = session
    }

    func get(_ url: URL, headers: [String: String] = [:]) async throws -> HTTPResponse {
        let req = HTTPRequest(method: .get, url: url, headers: headers)
        return try await execute(req)
    }

    func execute(_ request: HTTPRequest) async throws -> HTTPResponse {
        var urlRequest = URLRequest(url: request.url)
        urlRequest.httpMethod = request.method.rawValue
        urlRequest.timeoutInterval = 30
        request.headers.forEach { urlRequest.setValue($1, forHTTPHeaderField: $0) }
        urlRequest.httpBody = request.body

        log.debug("→ \(request.method.rawValue) \(request.url)")

        do {
            let start = Date()
            let (data, response) = try await session.data(for: urlRequest)
            let durationMs = Int(Date().timeIntervalSince(start) * 1000)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw SwaggerManError.network(.unexpectedStatus(-1, body: ""))
            }

            var headers: [String: String] = [:]
            for (rawKey, rawValue) in httpResponse.allHeaderFields {
                if let key = rawKey as? String, let val = rawValue as? String {
                    headers[key] = val
                }
            }

            log.debug("← \(httpResponse.statusCode) (\(durationMs)ms)")
            return HTTPResponse(
                statusCode: httpResponse.statusCode,
                headers: headers,
                body: data,
                durationMs: durationMs
            )
        } catch let urlError as URLError {
            throw mapURLError(urlError, host: request.url.host ?? "")
        }
    }

    private func mapURLError(_ error: URLError, host: String) -> SwaggerManError {
        switch error.code {
        case .timedOut:
            .network(.timeout)
        case .notConnectedToInternet, .networkConnectionLost:
            .network(.offline)
        case .cannotFindHost, .cannotConnectToHost:
            .network(.dnsFailure(host: host))
        case .serverCertificateUntrusted, .serverCertificateHasUnknownRoot:
            .network(.tlsFailure(detail: error.localizedDescription))
        default:
            .network(.unexpectedStatus(-1, body: error.localizedDescription))
        }
    }
}
