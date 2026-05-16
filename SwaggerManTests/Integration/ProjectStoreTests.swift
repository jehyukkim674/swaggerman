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

    @Test("앱 재시작 시 가장 최근 사용한 프로젝트 자동 선택")
    func autoSelectsMostRecentProjectOnInit() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        // 프로젝트 두 개 추가 후 두 번째를 나중에 사용
        let store1 = ProjectStore(modelContext: ctx)
        try store1.addProject(alias: "First", swaggerURL: "https://a.com/docs")
        try store1.addProject(alias: "Second", swaggerURL: "https://b.com/docs")
        let second = store1.projects.first { $0.alias == "Second" }!
        store1.selectProject(second)  // lastUsedAt 갱신

        // 새 ProjectStore 인스턴스 (앱 재시작 시뮬레이션)
        let store2 = ProjectStore(modelContext: ctx)
        #expect(store2.selectedProject?.alias == "Second")
    }

    @Test("lastOperationID 저장 및 재시작 후 유지")
    func savesAndPersistsLastOperationID() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = store.projects[0]

        store.saveLastOperationID("GET /api/v1/users", for: project)

        #expect(project.lastOperationID == "GET /api/v1/users")
    }
}
