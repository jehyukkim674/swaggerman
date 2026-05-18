import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("EnvironmentStore Additional Tests", .serialized)
@MainActor
struct EnvironmentStoreAdditionalTests {
    func makeStores() throws // swiftlint:disable:next large_tuple
        -> (project: ProjectStore, env: EnvironmentStore, _container: ModelContainer)
    {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        return (ProjectStore(modelContext: ctx), EnvironmentStore(modelContext: ctx), container)
    }

    @Test("updateEnvironment — 모든 필드 업데이트")
    func updateEnvironmentAllFields() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let env = project.environments[0]

        try envStore.updateEnvironment(
            env,
            name: "Production",
            baseURL: "https://prod.api.com",
            authScheme: .bearer,
            bearerToken: "prod-token",
            basicUsername: nil,
            basicPassword: nil,
            apiKeyHeaderName: nil,
            apiKeyValue: nil,
            apiKeyInQuery: false,
            disableTLS: true
        )

        #expect(env.name == "Production")
        #expect(env.baseURL == "https://prod.api.com")
        #expect(env.authScheme == .bearer)
        #expect(env.bearerToken == "prod-token")
        #expect(env.disableTLSValidation == true)
    }

    @Test("updateEnvironment — Basic 인증 업데이트")
    func updateEnvironmentBasicAuth() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let env = project.environments[0]

        try envStore.updateEnvironment(
            env,
            name: "Staging",
            baseURL: "https://staging.api.com",
            authScheme: .basic,
            basicUsername: "admin",
            basicPassword: "password123"
        )

        #expect(env.authScheme == .basic)
        #expect(env.basicUsername == "admin")
        #expect(env.basicPassword == "password123")
    }

    @Test("updateEnvironment — API Key 인증 업데이트")
    func updateEnvironmentAPIKey() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let env = project.environments[0]

        try envStore.updateEnvironment(
            env,
            name: "Dev",
            baseURL: "https://dev.api.com",
            authScheme: .apiKey,
            apiKeyHeaderName: "X-Custom-Key",
            apiKeyValue: "secret-key",
            apiKeyInQuery: true
        )

        #expect(env.authScheme == .apiKey)
        #expect(env.apiKeyHeaderName == "X-Custom-Key")
        #expect(env.apiKeyValue == "secret-key")
        #expect(env.apiKeyInQuery == true)
    }

    @Test("deleteEnvironment 활성 환경일 때 첫 번째로 fallback")
    func deleteActiveEnvironmentFallsBackToFirst() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        // Add a second environment
        try envStore.addEnvironment(name: "Staging", baseURL: "https://staging.api.com", to: project)

        let staging = try #require(project.environments.first { $0.name == "Staging" })
        let dev = try #require(project.environments.first { $0.name == "Dev" })

        // Set staging as active
        envStore.setActive(staging, for: project)
        #expect(envStore.activeEnvironment(for: project)?.name == "Staging")

        // Delete the active environment
        try envStore.deleteEnvironment(staging, from: project)

        // Should fall back to the remaining environment
        let active = envStore.activeEnvironment(for: project)
        #expect(active?.id == dev.id)
    }

    @Test("deleteEnvironment 비활성 환경 삭제 시 활성 환경 유지")
    func deleteInactiveEnvironmentKeepsActive() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Staging", baseURL: "https://staging.api.com", to: project)
        let staging = try #require(project.environments.first { $0.name == "Staging" })
        let dev = try #require(project.environments.first { $0.name == "Dev" })

        // Dev is currently active (from onProjectChanged in addProject)
        envStore.setActive(dev, for: project)
        #expect(envStore.activeEnvironment(for: project)?.name == "Dev")

        // Delete the inactive staging environment
        try envStore.deleteEnvironment(staging, from: project)

        // Dev should still be active
        #expect(envStore.activeEnvironment(for: project)?.name == "Dev")
    }

    @Test("onProjectChanged — 빈 swaggerURL → 환경 자동 생성")
    func autoCreatesDefaultEnvironmentWithEmptyURL() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext
        let envStore = EnvironmentStore(modelContext: ctx)

        let project = Project(alias: "Empty URL", swaggerURL: "")
        ctx.insert(project)

        envStore.onProjectChanged(project)

        #expect(project.environments.count == 1)
        #expect(project.environments[0].name == "Default")
    }

    @Test("activeEnvironment — 저장된 activeID와 일치하는 환경 반환")
    func activeEnvironmentReturnsMatchingEnvironment() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Prod", baseURL: "https://prod.api.com", to: project)
        let prod = try #require(project.environments.first { $0.name == "Prod" })

        envStore.setActive(prod, for: project)
        let active = envStore.activeEnvironment(for: project)
        #expect(active?.id == prod.id)
    }

    @Test("onProjectChanged 이미 활성화 된 경우 activeEnvironments 변경 안 됨")
    func onProjectChangedDoesNotOverrideExistingActive() throws {
        let (projectStore, envStore, _container) = try makeStores()
        _ = _container

        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        try envStore.addEnvironment(name: "Second", baseURL: "https://second.api.com", to: project)
        let second = try #require(project.environments.first { $0.name == "Second" })

        // Set second as active
        envStore.setActive(second, for: project)

        // Call onProjectChanged again — should NOT reset to first
        envStore.onProjectChanged(project)

        // Still should be second because activeEnvironments[project.id] is already set
        #expect(envStore.activeEnvironment(for: project)?.id == second.id)
    }
}
