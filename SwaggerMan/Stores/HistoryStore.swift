import os.log
import SwiftData
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "HistoryStore")

@Observable
@MainActor
final class HistoryStore {
    private(set) var items: [HistoryItem] = []
    private let modelContext: ModelContext
    private let maxItemsPerProject = 500

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    // MARK: - Public

    func loadHistory(for project: Project) {
        items = project.history.sorted { $0.executedAt > $1.executedAt }
    }

    func append(_ item: HistoryItem, to project: Project) {
        item.project = project
        modelContext.insert(item)
        project.history.append(item)

        let sorted = project.history.sorted { $0.executedAt < $1.executedAt }
        if sorted.count > maxItemsPerProject {
            let excess = sorted.prefix(sorted.count - maxItemsPerProject)
            for old in excess {
                project.history.removeAll { $0.id == old.id }
                modelContext.delete(old)
            }
        }

        save()
        loadHistory(for: project)
        log.debug("History appended — total: \(project.history.count)")
    }

    func delete(_ item: HistoryItem, from project: Project) {
        project.history.removeAll { $0.id == item.id }
        modelContext.delete(item)
        save()
        loadHistory(for: project)
    }

    func clear(for project: Project) {
        for item in project.history {
            modelContext.delete(item)
        }
        project.history.removeAll()
        save()
        items = []
    }

    // MARK: - Private

    private func save() {
        do {
            try modelContext.save()
        } catch {
            log.error("HistoryStore save failed: \(error.localizedDescription)")
        }
    }
}
