import Foundation
import os.log

private let authLog = Logger(subsystem: "com.swaggerman", category: "OperationStore")

extension OperationStore {
    func buildSpecAuthHeaders(for project: Project) async throws -> [String: String] {
        switch project.specAuthType {
        case "bearer":
            guard let token = project.specAuthValue1, !token.isEmpty else { return [:] }
            return ["Authorization": "Bearer \(token)"]

        case "basic":
            guard let username = project.specAuthValue1,
                  let password = project.specAuthValue2 else { return [:] }
            let encoded = Data("\(username):\(password)".utf8).base64EncodedString()
            return ["Authorization": "Basic \(encoded)"]

        case "apikey":
            guard let name = project.specAuthValue1, !name.isEmpty,
                  let value = project.specAuthValue2 else { return [:] }
            return [name: value]

        case "login":
            return try await fetchLoginToken(for: project)

        default:
            return [:]
        }
    }

    private func fetchLoginToken(for project: Project) async throws -> [String: String] {
        guard let loginURLString = project.specAuthValue1,
              let loginURL = URL(string: loginURLString),
              let username = project.specAuthValue2,
              let password = project.specAuthValue3 else { return [:] }

        let body = try JSONEncoder().encode(["username": username, "password": password])
        let request = HTTPRequest(
            method: .post,
            url: loginURL,
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let response = try await httpClient.execute(request, disableTLS: specDisableTLS)
        authLog.info("Login response: \(response.statusCode) from \(loginURLString)")

        if let json = try? JSONSerialization.jsonObject(with: response.body) as? [String: Any] {
            let tokenKeys = ["token", "access_token", "accessToken", "jwt", "idToken", "id_token"]
            for key in tokenKeys {
                if let token = json[key] as? String, !token.isEmpty {
                    return ["Authorization": "Bearer \(token)"]
                }
            }
            for wrapper in ["data", "result", "response"] {
                if let nested = json[wrapper] as? [String: Any] {
                    for key in tokenKeys {
                        if let token = nested[key] as? String, !token.isEmpty {
                            return ["Authorization": "Bearer \(token)"]
                        }
                    }
                }
            }
        }

        let cookieHeader = response.headers["Set-Cookie"] ?? response.headers["set-cookie"]
        if let cookie = cookieHeader, !cookie.isEmpty {
            let cookieValue = cookie.components(separatedBy: ";").first ?? cookie
            return ["Cookie": cookieValue]
        }

        authLog.warning("Login succeeded but no token or cookie found in response")
        return [:]
    }
}
