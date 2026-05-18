import Foundation

struct HTTPResponse {
    let statusCode: Int
    let headers: [String: String]
    let body: Data
    let durationMs: Int

    var isSuccess: Bool {
        (200 ..< 300).contains(statusCode)
    }

    var bodyString: String? {
        String(data: body, encoding: .utf8)
    }
}
