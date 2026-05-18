import Foundation
import SwiftData

enum AuthSchemeType: String, Codable, CaseIterable {
    case none, bearer, basic, apiKey

    var displayName: String {
        switch self {
        case .none: "없음"
        case .bearer: "Bearer Token"
        case .basic: "Basic Auth"
        case .apiKey: "API Key"
        }
    }
}

@Model
final class APIEnvironment {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var name: String
    var baseURL: String
    var authScheme: AuthSchemeType

    // Auth values
    var bearerToken: String?
    var basicUsername: String?
    var basicPassword: String?
    var apiKeyValue: String?
    var apiKeyHeaderName: String?
    var apiKeyInQuery: Bool?

    var disableTLSValidation: Bool
    var createdAt: Date

    init(name: String, baseURL: String, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.name = name
        self.baseURL = baseURL
        self.authScheme = .none
        self.bearerToken = nil
        self.basicUsername = nil
        self.basicPassword = nil
        self.apiKeyValue = nil
        self.apiKeyHeaderName = nil
        self.apiKeyInQuery = nil
        self.disableTLSValidation = false
        self.createdAt = Date()
    }
}
