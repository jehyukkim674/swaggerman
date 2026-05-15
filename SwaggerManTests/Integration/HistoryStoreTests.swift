import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("HistoryStore Tests", .serialized)
@MainActor
struct HistoryStoreTests {

    func makeSetup() throws -> (HistoryStore, Project, _container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let historyStore = HistoryStore(modelContext: ctx)
        return (historyStore, project, container)
    }

    func makeItem(durationMs: Int = 100) -> HistoryItem {
        HistoryItem(
            environmentID: UUID(),
            method: "GET",
            path: "/status",
            fullURL: "https://api.com/status",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "ok",
            responseSize: 2,
            durationMs: durationMs
        )
    }

    @Test("항목 추가 시 project.history에 반영")
    func appendsItem() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        store.append(makeItem(), to: project)
        #expect(project.history.count == 1)
        #expect(store.items.count == 1)
    }

    @Test("500개 초과 시 가장 오래된 항목 삭제")
    func enforcesLimit() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        for i in 0..<501 {
            store.append(makeItem(durationMs: i), to: project)
        }
        #expect(project.history.count == 500)
        #expect(store.items.count == 500)
    }

    @Test("clear 시 모든 항목 제거")
    func clearsHistory() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        store.append(makeItem(), to: project)
        store.append(makeItem(), to: project)
        store.clear(for: project)
        #expect(project.history.isEmpty)
        #expect(store.items.isEmpty)
    }

    @Test("loadHistory — executedAt 내림차순 정렬")
    func loadsSortedDescending() throws {
        let (store, project, _container) = try makeSetup()
        _ = _container
        let item1 = makeItem(durationMs: 10)
        let item2 = makeItem(durationMs: 20)
        store.append(item1, to: project)
        store.append(item2, to: project)
        store.loadHistory(for: project)
        // Most recent first — item2 was inserted last so executedAt is later
        #expect(store.items.first?.durationMs == 20)
    }
}
