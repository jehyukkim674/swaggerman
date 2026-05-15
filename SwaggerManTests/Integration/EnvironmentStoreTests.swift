import Testing
import SwiftData
@testable import SwaggerMan

@Suite("EnvironmentStore Integration Tests", .serialized)
@MainActor
struct EnvironmentStoreTests {

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
        let prod = project.environments.first { $0.name == "Prod" }!
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
        let toDelete = project.environments.first { $0.name == "ToDelete" }!

        try envStore.deleteEnvironment(toDelete, from: project)

        #expect(project.environments.allSatisfy { $0.name != "ToDelete" })
    }

    @Test("onProjectChanged 호출 시 첫 번째 환경 활성화")
    func activatesFirstEnvironmentOnProjectChanged() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let devEnv = project.environments.first!

        envStore.onProjectChanged(project)

        #expect(envStore.activeEnvironment(for: project)?.id == devEnv.id)
    }
}
