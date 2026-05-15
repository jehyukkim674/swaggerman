import SwiftData
import Foundation

@Model
final class RequestCollection {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var name: String
    var sortOrder: Int

    @Relationship(deleteRule: .cascade, inverse: \SavedRequest.collection)
    var requests: [SavedRequest]

    init(name: String, sortOrder: Int, project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.name = name
        self.sortOrder = sortOrder
        self.requests = []
    }
}
