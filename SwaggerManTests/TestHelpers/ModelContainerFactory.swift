import SwiftData
import Foundation
@testable import SwaggerMan

enum ModelContainerFactory {
    @MainActor
    static func makeInMemory() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(
            for:
                Project.self,
                APIEnvironment.self,
                FavoriteOperation.self,
                RequestCollection.self,
                SavedRequest.self,
                HistoryItem.self,
            configurations: config
        )
    }
}
