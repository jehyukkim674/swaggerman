import Foundation

enum CurlBuilder {
    struct Options {
        var maskAuthorization: Bool = true
        var insecure: Bool = false
    }

    static func build(_ request: HTTPRequest, options: Options = .init()) -> String {
        var parts: [String] = []

        parts.append("curl")

        if request.method != .get {
            parts.append("-X \(request.method.rawValue)")
        }

        for (key, value) in request.headers.sorted(by: { $0.key < $1.key }) {
            let displayValue: String = if options.maskAuthorization, key.lowercased() == "authorization" {
                maskAuthValue(value)
            } else {
                value
            }
            parts.append("-H \"\(key): \(displayValue)\"")
        }

        if let body = request.body, let bodyStr = String(data: body, encoding: .utf8) {
            let escaped = bodyStr.replacingOccurrences(of: "'", with: "'\\''")
            parts.append("-d '\(escaped)'")
        }

        if options.insecure {
            parts.append("-k")
        }

        parts.append(request.url.absoluteString)

        return parts.joined(separator: " \\\n  ")
    }

    private static func maskAuthValue(_ value: String) -> String {
        let split = value.split(separator: " ", maxSplits: 1)
        if split.count == 2 { return "\(split[0]) ***" }
        return "***"
    }
}
