import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("HistoryStore Delete Tests", .serialized)
@MainActor
struct HistoryStoreDeleteTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeProject(in ctx: ModelContext) throws -> Project {
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "API", swaggerURL: "https://api.test")
        return store.projects[0]
    }

    func makeHistoryItem(project: Project) -> HistoryItem {
        HistoryItem(
            environmentID: UUID(),
            method: "GET", path: "/users",
            fullURL: "https://api.test/users",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "[]",
            responseSize: 2,
            durationMs: 50,
            project: project
        )
    }

    @Test("delete — 단건 삭제")
    func deleteSingle() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let historyStore = HistoryStore(modelContext: ctx)

        let item1 = makeHistoryItem(project: project)
        let item2 = makeHistoryItem(project: project)
        ctx.insert(item1)
        ctx.insert(item2)
        project.history = [item1, item2]
        historyStore.loadHistory(for: project)

        historyStore.delete(item1, from: project)

        #expect(historyStore.items.count == 1)
        #expect(historyStore.items[0].id == item2.id)
        #expect(project.history.count == 1)
        #expect(project.history[0].id == item2.id)
    }

    @Test("delete — 없는 항목 삭제 시 크래시 없음")
    func deleteNonExistent() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let historyStore = HistoryStore(modelContext: ctx)
        historyStore.loadHistory(for: project)

        let orphan = makeHistoryItem(project: project)
        historyStore.delete(orphan, from: project)

        #expect(historyStore.items.isEmpty)
    }
}
