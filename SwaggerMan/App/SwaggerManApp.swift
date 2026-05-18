import SwiftData
import SwiftUI

@main
struct SwaggerManApp: App {
    let container: ModelContainer

    init() {
        do {
            container = try ModelContainer(
                for:
                Project.self,
                APIEnvironment.self,
                FavoriteOperation.self,
                RequestCollection.self,
                SavedRequest.self,
                HistoryItem.self
            )
        } catch {
            fatalError("SwiftData ModelContainer 초기화 실패: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .modelContainer(container)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .defaultSize(width: 1200, height: 750)
    }
}
