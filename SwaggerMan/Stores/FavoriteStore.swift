import os.log
import SwiftData
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "FavoriteStore")

@Observable
@MainActor
final class FavoriteStore {
    private(set) var favorites: [FavoriteOperation] = []
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func load(for project: Project) {
        favorites = project.favorites.sorted { $0.sortOrder < $1.sortOrder }
    }

    func toggle(method: String, path: String, for project: Project) {
        if let existing = favorites.first(where: { $0.method == method && $0.path == path }) {
            remove(existing, from: project)
        } else {
            add(method: method, path: path, to: project)
        }
    }

    func isFavorite(method: String, path: String) -> Bool {
        favorites.contains { $0.method == method && $0.path == path }
    }

    func move(from source: IndexSet, to destination: Int) {
        var reordered = favorites
        reordered.move(fromOffsets: source, toOffset: destination)
        for (idx, item) in reordered.enumerated() {
            item.sortOrder = idx
        }
        favorites = reordered
        save()
    }

    // MARK: - Private

    private func add(method: String, path: String, to project: Project) {
        let nextOrder = (favorites.map(\.sortOrder).max() ?? -1) + 1
        let fav = FavoriteOperation(method: method, path: path, sortOrder: nextOrder, project: project)
        modelContext.insert(fav)
        save()
        load(for: project)
        log.debug("Favorite added: \(method) \(path)")
    }

    private func remove(_ item: FavoriteOperation, from project: Project) {
        project.favorites.removeAll { $0.id == item.id }
        modelContext.delete(item)
        save()
        load(for: project)
        log.debug("Favorite removed: \(item.method) \(item.path)")
    }

    private func save() {
        do {
            try modelContext.save()
        } catch {
            log.error("FavoriteStore save failed: \(error.localizedDescription)")
        }
    }
}
