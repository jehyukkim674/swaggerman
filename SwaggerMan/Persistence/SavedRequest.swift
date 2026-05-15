import SwiftData
import Foundation

@Model
final class SavedRequest {
    @Attribute(.unique) var id: UUID
    var collection: RequestCollection?
    var name: String
    var method: String
    var path: String
    var pathParamsJSON: String
    var queryParamsJSON: String
    var headersJSON: String
    var bodyJSON: String?
    var sortOrder: Int
    var createdAt: Date
    var updatedAt: Date

    init(name: String, method: String, path: String,
         collection: RequestCollection? = nil) {
        self.id = UUID()
        self.collection = collection
        self.name = name
        self.method = method
        self.path = path
        self.pathParamsJSON = "{}"
        self.queryParamsJSON = "{}"
        self.headersJSON = "{}"
        self.sortOrder = 0
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}
