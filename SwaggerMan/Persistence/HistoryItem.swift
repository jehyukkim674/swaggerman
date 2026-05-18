import Foundation
import SwiftData

@Model
final class HistoryItem {
    @Attribute(.unique) var id: UUID
    var project: Project?
    var environmentID: UUID
    var method: String
    var path: String
    var fullURL: String
    var requestHeadersJSON: String
    var requestBody: String?
    var responseStatus: Int
    var responseHeadersJSON: String
    var responseBody: String
    var responseSize: Int
    var durationMs: Int
    var executedAt: Date

    init(environmentID: UUID, method: String, path: String, fullURL: String,
         requestHeadersJSON: String, requestBody: String?,
         responseStatus: Int, responseHeadersJSON: String,
         responseBody: String, responseSize: Int, durationMs: Int,
         project: Project? = nil) {
        self.id = UUID()
        self.project = project
        self.environmentID = environmentID
        self.method = method
        self.path = path
        self.fullURL = fullURL
        self.requestHeadersJSON = requestHeadersJSON
        self.requestBody = requestBody
        self.responseStatus = responseStatus
        self.responseHeadersJSON = responseHeadersJSON
        self.responseBody = responseBody
        self.responseSize = responseSize
        self.durationMs = durationMs
        self.executedAt = Date()
    }
}
