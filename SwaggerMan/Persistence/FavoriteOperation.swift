import Foundation
import SwiftData

@Model
final class FavoriteOperation {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var method: String
    var path: String
    var sortOrder: Int
    var createdAt: Date

    init(method: String, path: String, sortOrder: Int, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.method = method
        self.path = path
        self.sortOrder = sortOrder
        self.createdAt = Date()
    }
}
