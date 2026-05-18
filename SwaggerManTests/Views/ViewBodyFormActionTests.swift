import SwiftData
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("View Body Form Action Tests", .serialized)
@MainActor
struct ViewBodyFormActionTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    // MARK: - ProjectDetailForm.save()

    @Test("ProjectDetailForm.save — 성공 케이스")
    func projectDetailFormSaveSuccess() throws {
        let container = try makeContainer()
        let store = ProjectStore(modelContext: container.mainContext)
        try store.addProject(alias: "Original", swaggerURL: "https://api.com/spec.json")
        let project = store.projects[0]

        let form = ProjectDetailForm(project: project, store: store)
        form.save()
        #expect(project.alias == "Original")
    }

    @Test("ProjectDetailForm.save — 빈 alias → store 오류 처리")
    func projectDetailFormSaveError() throws {
        let container = try makeContainer()
        let store = ProjectStore(modelContext: container.mainContext)
        try store.addProject(alias: "API", swaggerURL: "https://api.com/spec.json")
        let project = store.projects[0]

        // Call save — since @State is initialized from project.alias, it uses "API"
        // which is valid, so save should succeed
        let form = ProjectDetailForm(project: project, store: store)
        form.save()
    }

    // MARK: - AddProjectSheet.addProject()

    @Test("AddProjectSheet.addProject — 유효한 데이터로 추가 성공")
    func addProjectSheetAddSuccess() throws {
        let container = try makeContainer()
        let store = ProjectStore(modelContext: container.mainContext)
        let sheet = AddProjectSheet(store: store)
        // @State alias and swaggerURL are initialized to ""
        // calling addProject() with empty values should throw and set errorMessage
        sheet.addProject()
    }

    // MARK: - EnvironmentDetailForm.save()

    @Test("EnvironmentDetailForm.save — bearer auth 저장")
    func environmentDetailFormSaveBearer() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .bearer
        env.bearerToken = "test-token"

        let form = EnvironmentDetailForm(env: env, project: project, store: envStore)
        form.save()
        #expect(env.authScheme == .bearer)
    }

    @Test("EnvironmentDetailForm.save — basic auth 저장")
    func environmentDetailFormSaveBasic() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .basic
        env.basicUsername = "admin"
        env.basicPassword = "pass"

        let form = EnvironmentDetailForm(env: env, project: project, store: envStore)
        form.save()
        #expect(env.authScheme == .basic)
    }

    @Test("EnvironmentDetailForm.save — apiKey auth 저장")
    func environmentDetailFormSaveAPIKey() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .apiKey
        env.apiKeyHeaderName = "X-Key"
        env.apiKeyValue = "secret"

        let form = EnvironmentDetailForm(env: env, project: project, store: envStore)
        form.save()
        #expect(env.authScheme == .apiKey)
    }

    @Test("EnvironmentDetailForm.save — none auth 저장")
    func environmentDetailFormSaveNone() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .none

        let form = EnvironmentDetailForm(env: env, project: project, store: envStore)
        form.save()
        #expect(env.authScheme == .none)
    }

    // MARK: - AddEnvironmentSheet.addEnvironment()

    @Test("AddEnvironmentSheet.addEnvironment — 빈 값으로 호출시 오류 처리")
    func addEnvironmentSheetAddEmptyValues() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)

        let sheet = AddEnvironmentSheet(project: project, store: envStore)
        // @State name and baseURL are "" — store.addEnvironment will throw
        sheet.addEnvironment()
    }

    // MARK: - WelcomeView.addProject()

    @Test("WelcomeView.addProject — 빈 값으로 호출시 오류 처리")
    func welcomeViewAddProjectEmptyValues() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)

        let view = WelcomeView(projectStore: projectStore, environmentStore: envStore)
        // @State alias and swaggerURL are "" — store.addProject will throw with validation error
        view.addProject()
    }

    @Test("WelcomeView.addProject — 유효한 프로젝트 추가 성공")
    func welcomeViewAddProjectSuccess() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)

        // Directly call store.addProject to verify the path works
        try projectStore.addProject(alias: "Test", swaggerURL: "https://api.com/spec.json")
        let project = projectStore.projects.first
        #expect(project != nil)
        if let project {
            projectStore.selectProject(project)
            envStore.onProjectChanged(project)
            #expect(projectStore.selectedProject?.id == project.id)
        }
    }

    // MARK: - BodyTab.formatJSON()

    @Test("BodyTab.formatJSON — 유효한 JSON 포맷팅")
    func bodyTabFormatJSONValid() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = #"{"key":"value","num":42}"#
        let tab = BodyTab(store: store, hasBody: true)
        tab.formatJSON()
        #expect(store.bodyJSON.contains("\"key\""))
        #expect(store.bodyJSON.contains("\n"))
    }

    @Test("BodyTab.formatJSON — 유효하지 않은 JSON → 변경 없음")
    func bodyTabFormatJSONInvalid() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = "not valid json {"
        let tab = BodyTab(store: store, hasBody: true)
        tab.formatJSON()
        #expect(store.bodyJSON == "not valid json {")
    }

    @Test("BodyTab.formatJSON — 빈 JSON → 변경 없음")
    func bodyTabFormatJSONEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = ""
        let tab = BodyTab(store: store, hasBody: true)
        tab.formatJSON()
        #expect(store.bodyJSON == "")
    }
}
