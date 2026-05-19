import Foundation
import SwiftData

@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var alias: String
    var swaggerURL: String
    var createdAt: Date
    var lastUsedAt: Date
    var lastOperationID: String?
    var securityValuesJSON: String? // JSON-encoded [String: String]
    var disableTLSVerification: Bool = true
    // Spec auth — type: "bearer" | "basic" | "apikey" | "login"
    var specAuthType: String?
    var specAuthValue1: String? // bearer: token | basic: username | apikey: header-name | login: url
    var specAuthValue2: String? // basic: password | apikey: header-value | login: username
    var specAuthValue3: String? // login: password

    @Relationship(deleteRule: .cascade, inverse: \APIEnvironment.project)
    var environments: [APIEnvironment]

    @Relationship(deleteRule: .cascade, inverse: \RequestCollection.project)
    var collections: [RequestCollection]

    @Relationship(deleteRule: .cascade, inverse: \FavoriteOperation.project)
    var favorites: [FavoriteOperation]

    @Relationship(deleteRule: .cascade, inverse: \HistoryItem.project)
    var history: [HistoryItem]

    init(alias: String, swaggerURL: String) {
        self.id = UUID()
        self.alias = alias
        self.swaggerURL = swaggerURL
        self.createdAt = Date()
        self.lastUsedAt = Date()
        self.lastOperationID = nil
        self.environments = []
        self.collections = []
        self.favorites = []
        self.history = []
    }
}
