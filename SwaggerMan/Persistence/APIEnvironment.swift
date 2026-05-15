import SwiftData
import Foundation

enum AuthSchemeType: String, Codable {
    case none, bearer, basic, apiKey
}

@Model
final class APIEnvironment {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var name: String
    var baseURL: String
    var authScheme: AuthSchemeType
    var apiKeyHeaderName: String?
    var apiKeyLocation: String?
    var disableTLSValidation: Bool
    var createdAt: Date

    var keychainKey: String {
        "com.swaggerman.token.\(project?.id.uuidString ?? "").\(id.uuidString)"
    }

    init(name: String, baseURL: String, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.name = name
        self.baseURL = baseURL
        self.authScheme = .none
        self.disableTLSValidation = false
        self.createdAt = Date()
    }
}
