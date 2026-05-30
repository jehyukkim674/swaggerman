import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("ProjectStore Additional Tests", .serialized)
@MainActor
struct ProjectStoreAdditionalTests {
    func makeStore() throws -> (store: ProjectStore, container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        return (ProjectStore(modelContext: container.mainContext), container)
    }

    @Test("빈 alias → ValidationError throw")
    func emptyAliasThrows() throws {
        let (store, _container) = try makeStore()
        _ = _container

        #expect(throws: SwaggerManError.self) {
            try store.addProject(alias: "   ", swaggerURL: "https://api.com")
        }
    }

    @Test("whitespace만 있는 alias → trim 후 빈 문자열로 throw")
    func whitespaceOnlyAliasThrows() throws {
        let (store, _container) = try makeStore()
        _ = _container

        #expect(throws: SwaggerManError.self) {
            try store.addProject(alias: "\t  \t", swaggerURL: "https://api.com")
        }
    }

    @Test("updateProject — alias와 swaggerURL 업데이트")
    func updateProjectAlias() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "Old Name", swaggerURL: "https://old.com/docs")
        let project = store.projects[0]

        try store.updateProject(project, alias: "New Name", swaggerURL: "https://new.com/docs")

        #expect(project.alias == "New Name")
        #expect(project.swaggerURL == "https://new.com/docs")
    }

    @Test("updateProject — 중복 alias → PersistenceError throw")
    func updateProjectDuplicateAliasThrows() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "API One", swaggerURL: "https://api1.com/docs")
        try store.addProject(alias: "API Two", swaggerURL: "https://api2.com/docs")

        let project1 = try #require(store.projects.first { $0.alias == "API One" })

        #expect(throws: SwaggerManError.self) {
            try store.updateProject(project1, alias: "API Two", swaggerURL: "https://api1.com/docs")
        }
    }

    @Test("updateProject — 자기 자신 alias는 중복 아님")
    func updateProjectSameAliasNotDuplicate() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "My API", swaggerURL: "https://api.com/docs")
        let project = store.projects[0]

        // Updating to same alias should not throw
        try store.updateProject(project, alias: "My API", swaggerURL: "https://api.com/v2/docs")
        #expect(project.swaggerURL == "https://api.com/v2/docs")
    }

    @Test("deleteProject — 선택된 프로젝트 삭제 시 다음 프로젝트 선택")
    func deleteSelectedProjectSelectsNext() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "First", swaggerURL: "https://first.com/docs")
        try store.addProject(alias: "Second", swaggerURL: "https://second.com/docs")

        let first = try #require(store.projects.first { $0.alias == "First" })
        store.selectProject(first)
        #expect(store.selectedProject?.alias == "First")

        try store.deleteProject(first)

        // Should now have Second selected (or nil if no other projects)
        #expect(store.projects.count == 1)
        // selectedProject should have changed
        #expect(store.selectedProject?.alias != "First")
    }

    @Test("deleteProject — 선택되지 않은 프로젝트 삭제 시 선택 유지")
    func deleteUnselectedProjectKeepsSelection() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "First", swaggerURL: "https://first.com/docs")
        try store.addProject(alias: "Second", swaggerURL: "https://second.com/docs")

        let first = try #require(store.projects.first { $0.alias == "First" })
        let second = try #require(store.projects.first { $0.alias == "Second" })
        store.selectProject(first)

        try store.deleteProject(second)

        #expect(store.selectedProject?.alias == "First")
    }

    @Test("selectProject → selectedProject 업데이트 및 lastUsedAt 갱신")
    func selectProjectUpdatesLastUsedAt() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = store.projects[0]
        let before = Date(timeIntervalSinceNow: -1)

        store.selectProject(project)

        #expect(store.selectedProject?.id == project.id)
        #expect(project.lastUsedAt > before)
    }

    @Test("addProject — selectedProject가 없을 때 자동 선택")
    func addProjectAutoSelectsFirst() throws {
        let (store, _container) = try makeStore()
        _ = _container

        #expect(store.selectedProject == nil)
        try store.addProject(alias: "First", swaggerURL: "https://api.com/docs")
        #expect(store.selectedProject?.alias == "First")
    }

    @Test("addProject — 이미 selectedProject 있을 때 자동 선택 안 됨")
    func addProjectDoesNotOverrideSelectedProject() throws {
        let (store, _container) = try makeStore()
        _ = _container

        try store.addProject(alias: "First", swaggerURL: "https://first.com/docs")
        try store.addProject(alias: "Second", swaggerURL: "https://second.com/docs")

        // selectedProject should still be first (was auto-selected)
        #expect(store.selectedProject?.alias == "First")
    }

    @Test("재초기화 시 사용자의 disableTLSVerification 설정을 덮어쓰지 않음")
    func reinitDoesNotForceDisableTLS() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = store.projects[0]

        // 사용자가 TLS 검증을 다시 켬(=해제 false)
        project.disableTLSVerification = false
        try ctx.save()

        // 앱 재실행 시뮬레이션: 같은 컨텍스트로 새 ProjectStore 생성
        let store2 = ProjectStore(modelContext: ctx)
        let reloaded = store2.projects.first { $0.id == project.id }
        #expect(reloaded?.disableTLSVerification == false)
    }
}
