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
        case .get: "green"
        case .post: "blue"
        case .put: "orange"
        case .delete: "red"
        case .patch: "purple"
        case .options, .head: "gray"
        }
    }
}

extension HTTPMethod {
    var swiftUIColor: Color {
        switch self {
        case .get: .green
        case .post: .blue
        case .put: .orange
        case .delete: .red
        case .patch: .purple
        case .options, .head: .gray
        }
    }

    var sfSymbol: String {
        switch self {
        case .get: "arrow.down.circle.fill"
        case .post: "plus.circle.fill"
        case .put: "arrow.up.circle.fill"
        case .delete: "trash.fill"
        case .patch: "pencil.circle.fill"
        case .options: "ellipsis.circle.fill"
        case .head: "eye.circle.fill"
        }
    }
}

struct HTTPRequest {
    let method: HTTPMethod
    let url: URL
    var headers: [String: String]
    var body: Data?
}
