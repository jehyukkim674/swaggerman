import Foundation
import SwiftUI

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

extension HTTPMethod {
    var swiftUIColor: Color {
        switch self {
        case .get: return .green
        case .post: return .blue
        case .put: return .orange
        case .delete: return .red
        case .patch: return .purple
        case .options, .head: return .gray
        }
    }

    var sfSymbol: String {
        switch self {
        case .get:     return "arrow.down.circle.fill"
        case .post:    return "plus.circle.fill"
        case .put:     return "arrow.up.circle.fill"
        case .delete:  return "trash.fill"
        case .patch:   return "pencil.circle.fill"
        case .options: return "ellipsis.circle.fill"
        case .head:    return "eye.circle.fill"
        }
    }
}

struct HTTPRequest {
    let method: HTTPMethod
    let url: URL
    var headers: [String: String]
    var body: Data?
}
