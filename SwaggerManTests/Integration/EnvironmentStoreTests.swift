import SwiftData
import Testing
@testable import SwaggerMan

@Suite("EnvironmentStore Integration Tests", .serialized)
@MainActor
struct EnvironmentStoreTests {
    // swiftlint:disable:next large_tuple
    func makeStores() throws -> (project: ProjectStore, env: EnvironmentStore, _container: ModelContainer) {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)
        return (projectStore, envStore, container)
    }

    @Test("환경 추가 시 해당 프로젝트에 귀속")
    func addsEnvironmentToProject() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Staging", baseURL: "https://staging.api.com", to: project)

        // Default "Dev" + added "Staging" = 2
        #expect(project.environments.count == 2)
        #expect(project.environments.contains(where: { $0.name == "Staging" }))
    }

    @Test("활성 환경 변경")
    func changesActiveEnvironment() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Prod", baseURL: "https://prod.api.com", to: project)
        let prod = try #require(project.environments.first { $0.name == "Prod" })
        envStore.setActive(prod, for: project)

        #expect(envStore.activeEnvironment(for: project)?.name == "Prod")
    }

    @Test("환경 삭제")
    func deletesEnvironment() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "ToDelete", baseURL: "https://x.com", to: project)
        let toDelete = try #require(project.environments.first { $0.name == "ToDelete" })

        try envStore.deleteEnvironment(toDelete, from: project)

        #expect(project.environments.allSatisfy { $0.name != "ToDelete" })
    }

    @Test("onProjectChanged 호출 시 첫 번째 환경 활성화")
    func activatesFirstEnvironmentOnProjectChanged() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let devEnv = try #require(project.environments.first)

        envStore.onProjectChanged(project)

        #expect(envStore.activeEnvironment(for: project)?.id == devEnv.id)
    }

    @Test("환경이 없는 프로젝트에 onProjectChanged 시 기본 환경 자동 생성")
    func autoCreatesDefaultEnvironmentWhenNoneExists() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)

        // 환경 없이 프로젝트 직접 삽입
        let project = Project(alias: "No-Env API", swaggerURL: "http://localhost:8000/swagger-ui")
        ctx.insert(project)

        #expect(project.environments.isEmpty)

        envStore.onProjectChanged(project)

        #expect(project.environments.count == 1)
        #expect(project.environments[0].name == "Default")
        #expect(envStore.activeEnvironment(for: project) != nil)
    }

    @Test("기본 환경 baseURL은 swaggerURL의 origin으로 설정")
    func defaultEnvironmentBaseURLIsOrigin() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let envStore = EnvironmentStore(modelContext: ctx)

        let project = Project(alias: "Test", swaggerURL: "http://localhost:8000/swagger-ui/index.html")
        ctx.insert(project)

        envStore.onProjectChanged(project)

        #expect(project.environments[0].baseURL == "http://localhost:8000")
    }

    @Test("activeEnvironment는 환경 없을 때 nil 반환")
    func activeEnvironmentReturnsNilWhenProjectHasNoEnvironments() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let envStore = EnvironmentStore(modelContext: ctx)

        let project = Project(alias: "Empty", swaggerURL: "https://api.com")
        ctx.insert(project)

        // onProjectChanged 없이 직접 조회 → nil
        #expect(envStore.activeEnvironment(for: project) == nil)
    }
}
