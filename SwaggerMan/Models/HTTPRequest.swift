import Foundation

enum HTTPMethod: String, Codable, CaseIterable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
    case options = "OPTIONS"
    case head = "HEAD"

    var color: String {
        switch self {
        case .get: return "green"
        case .post: return "blue"
        case .put: return "orange"
        case .delete: return "red"
        case .patch: return "purple"
        case .options, .head: return "gray"
        }
    }
}

struct HTTPRequest {
    let method: HTTPMethod
    let url: URL
    var headers: [String: String]
    var body: Data?
}
