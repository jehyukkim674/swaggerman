import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("FavoriteStore Tests", .serialized)
@MainActor
struct FavoriteStoreTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeProject(in ctx: ModelContext) throws -> Project {
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "Test", swaggerURL: "https://api.test")
        return store.projects[0]
    }

    @Test("toggle — add favorite")
    func toggleAdd() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/users", for: project)

        #expect(store.favorites.count == 1)
        #expect(store.favorites[0].method == "GET")
        #expect(store.favorites[0].path == "/users")
    }

    @Test("toggle — remove existing favorite")
    func toggleRemove() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/users", for: project)
        store.toggle(method: "GET", path: "/users", for: project)

        #expect(store.favorites.isEmpty)
    }

    @Test("isFavorite — true after add")
    func isFavoriteTrue() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "POST", path: "/login", for: project)

        #expect(store.isFavorite(method: "POST", path: "/login") == true)
        #expect(store.isFavorite(method: "GET", path: "/login") == false)
    }

    @Test("move — sortOrder 재정렬")
    func moveReorders() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/a", for: project)
        store.toggle(method: "POST", path: "/b", for: project)
        store.toggle(method: "DELETE", path: "/c", for: project)

        // move item at index 2 to index 0
        store.move(from: IndexSet(integer: 2), to: 0)

        #expect(store.favorites[0].path == "/c")
        #expect(store.favorites[0].sortOrder == 0)
        #expect(store.favorites[1].sortOrder == 1)
        #expect(store.favorites[2].sortOrder == 2)
    }

    @Test("load — sortOrder 기준 정렬")
    func loadSortsByOrder() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let project = try makeProject(in: ctx)
        let store = FavoriteStore(modelContext: ctx)

        store.toggle(method: "GET", path: "/z", for: project)
        store.toggle(method: "POST", path: "/a", for: project)

        let store2 = FavoriteStore(modelContext: ctx)
        store2.load(for: project)

        #expect(store2.favorites[0].path == "/z")
        #expect(store2.favorites[1].path == "/a")
    }
}
