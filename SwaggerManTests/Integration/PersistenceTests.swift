import Testing
import SwiftData
import Foundation
@testable import SwaggerMan

@Suite("Persistence Model Tests")
@MainActor
struct PersistenceTests {

    @Test("Project 생성 후 조회 가능")
    func createsProject() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        let project = Project(alias: "My API", swaggerURL: "https://api.example.com/docs")
        ctx.insert(project)
        try ctx.save()

        let descriptor = FetchDescriptor<Project>()
        let projects = try ctx.fetch(descriptor)

        #expect(projects.count == 1)
        #expect(projects[0].alias == "My API")
    }

    @Test("Project 삭제 시 APIEnvironment cascade 삭제")
    func deletionCascadesToEnvironments() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        let project = Project(alias: "Test", swaggerURL: "https://x.com")
        let env = APIEnvironment(name: "Dev", baseURL: "https://x.com", project: project)
        project.environments.append(env)
        ctx.insert(project)
        try ctx.save()

        ctx.delete(project)
        try ctx.save()

        let envs = try ctx.fetch(FetchDescriptor<APIEnvironment>())
        #expect(envs.isEmpty)
    }

    @Test("HistoryItem 생성 및 Project 연결")
    func historyItemLinkedToProject() throws {
        let container = try ModelContainerFactory.makeInMemory()
        let ctx = container.mainContext

        let project = Project(alias: "API", swaggerURL: "https://api.com/docs")
        ctx.insert(project)

        let item = HistoryItem(
            environmentID: UUID(),
            method: "GET", path: "/users",
            fullURL: "https://api.com/users",
            requestHeadersJSON: "{}",
            requestBody: nil,
            responseStatus: 200,
            responseHeadersJSON: "{}",
            responseBody: "[]",
            responseSize: 2,
            durationMs: 120,
            project: project
        )
        project.history.append(item)
        try ctx.save()

        let items = try ctx.fetch(FetchDescriptor<HistoryItem>())
        #expect(items.count == 1)
        #expect(items[0].responseStatus == 200)
    }
}
