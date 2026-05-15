import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("ProjectStore Integration Tests", .serialized)
@MainActor
struct ProjectStoreTests {

    func makeStore() throws -> (store: ProjectStore, container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let store = ProjectStore(modelContext: container.mainContext)
        return (store, container)
    }

    @Test("프로젝트 추가 시 기본 환경 자동 생성")
    func addsProjectWithDefaultEnvironment() throws {
        let (store, _container) = try makeStore()
        _ = _container  // keep container alive

        try store.addProject(alias: "My API", swaggerURL: "https://api.example.com/docs")

        #expect(store.projects.count == 1)
        #expect(store.projects[0].alias == "My API")
        #expect(store.projects[0].environments.count == 1)
        #expect(store.projects[0].environments[0].name == "Dev")
    }

    @Test("중복 alias 추가 시 PersistenceError throw")
    func throwsOnDuplicateAlias() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "My API", swaggerURL: "https://x.com/docs")

        #expect(throws: SwaggerManError.self) {
            try store.addProject(alias: "My API", swaggerURL: "https://y.com/docs")
        }
    }

    @Test("프로젝트 삭제 시 목록에서 제거됨")
    func deletesProject() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "To Delete", swaggerURL: "https://del.com/docs")
        let project = store.projects[0]
        try store.deleteProject(project)

        #expect(store.projects.isEmpty)
    }

    @Test("selectProject 호출 시 lastUsedAt 갱신")
    func updatesLastUsedAt() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = store.projects[0]
        let before = Date(timeIntervalSinceNow: -1)

        store.selectProject(project)

        #expect(project.lastUsedAt > before)
    }

    @Test("프로젝트가 없을 때 selectedProject는 nil")
    func selectedProjectNilWhenEmpty() throws {
        let (store, _container) = try makeStore()
        _ = _container
        #expect(store.selectedProject == nil)
    }
}
