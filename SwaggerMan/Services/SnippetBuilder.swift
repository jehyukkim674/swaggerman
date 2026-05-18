import Foundation

enum SnippetLanguage: String, CaseIterable {
    case swift = "Swift"
    case python = "Python"
    case javascript = "JavaScript"

    var sfSymbol: String {
        switch self {
        case .swift: "swift"
        case .python: "terminal"
        case .javascript: "globe"
        }
    }
}

enum SnippetBuilder {
    static func build(_ request: HTTPRequest, language: SnippetLanguage) -> String {
        switch language {
        case .swift: buildSwift(request)
        case .python: buildPython(request)
        case .javascript: buildJavaScript(request)
        }
    }

    // MARK: - Swift URLSession

    private static func buildSwift(_ request: HTTPRequest) -> String {
        let url = request.url.absoluteString

        // Simple GET with no headers: use the shorthand data(from:) form
        if request.method == .get, request.headers.isEmpty, request.body == nil {
            return [
                "let (data, response) = try await URLSession.shared.data(from: URL(string: \"\(url)\")!)",
                "let httpResponse = response as! HTTPURLResponse",
                "print(httpResponse.statusCode)",
                "print(String(data: data, encoding: .utf8) ?? \"\")"
            ].joined(separator: "\n")
        }

        var lines = ["var request = URLRequest(url: URL(string: \"\(url)\")!)"]

        if request.method != .get {
            lines.append("request.httpMethod = \"\(request.method.rawValue)\"")
        }

        for (key, value) in request.headers.sorted(by: { $0.key < $1.key }) {
            lines.append("request.setValue(\"\(value)\", forHTTPHeaderField: \"\(key)\")")
        }

        if let body = request.body, let bodyString = String(data: body, encoding: .utf8) {
            let escaped = bodyString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            lines.append("request.httpBody = Data(\"\(escaped)\".utf8)")
        }

        lines += [
            "",
            "let (data, response) = try await URLSession.shared.data(for: request)",
            "let httpResponse = response as! HTTPURLResponse",
            "print(httpResponse.statusCode)",
            "print(String(data: data, encoding: .utf8) ?? \"\")"
        ]

        return lines.joined(separator: "\n")
    }

    // MARK: - Python requests

    private static func buildPython(_ request: HTTPRequest) -> String {
        let url = request.url.absoluteString
        let method = request.method.rawValue.lowercased()

        var args = ["    '\(url)'"]

        if !request.headers.isEmpty {
            let headerLines = request.headers.sorted(by: { $0.key < $1.key })
                .map { "        \"\($0.key)\": \"\($0.value)\"" }
                .joined(separator: ",\n")
            args.append("    headers={\n\(headerLines)\n    }")
        }

        if let body = request.body, let bodyString = String(data: body, encoding: .utf8) {
            let escaped = bodyString
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            args.append("    data='\(escaped)'")
        }

        let argsJoined = args.joined(separator: ",\n")
        return [
            "import requests",
            "",
            "response = requests.\(method)(",
            "\(argsJoined),",
            ")",
            "print(response.status_code)",
            "print(response.json())"
        ].joined(separator: "\n")
    }

    // MARK: - JavaScript fetch

    private static func buildJavaScript(_ request: HTTPRequest) -> String {
        let url = request.url.absoluteString

        // Simple GET with no headers or body
        if request.method == .get, request.headers.isEmpty, request.body == nil {
            return [
                "const response = await fetch(\"\(url)\");",
                "const data = await response.json();",
                "console.log(response.status, data);"
            ].joined(separator: "\n")
        }

        var options: [String] = []

        if request.method != .get {
            options.append("  method: \"\(request.method.rawValue)\"")
        }

        if !request.headers.isEmpty {
            let headerLines = request.headers.sorted(by: { $0.key < $1.key })
                .map { "    \"\($0.key)\": \"\($0.value)\"" }
                .joined(separator: ",\n")
            options.append("  headers: {\n\(headerLines)\n  }")
        }

        if let body = request.body, let bodyString = String(data: body, encoding: .utf8) {
            let escaped = bodyString.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            options.append("  body: '\(escaped)'")
        }

        let optionsJoined = options.joined(separator: ",\n")
        return [
            "const response = await fetch(\"\(url)\", {",
            "\(optionsJoined),",
            "});",
            "const data = await response.json();",
            "console.log(response.status, data);"
        ].joined(separator: "\n")
    }
}
