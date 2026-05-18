import SwiftData
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("View Body Settings Tests", .serialized)
@MainActor
struct ViewBodySettingsTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeScheme(id: String = "auth", name: String = "auth",
                    kind: SecuritySchemeKind = .http(scheme: "bearer"),
                    description: String? = nil) -> ParsedSecurityScheme
    {
        ParsedSecurityScheme(id: id, name: name, kind: kind, description: description)
    }

    // MARK: - EnvironmentDetailForm

    @Test("EnvironmentDetailForm — none scheme body 실행")
    func environmentDetailFormNone() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .none

        _ = EnvironmentDetailForm(env: env, project: project, store: envStore).body
    }

    @Test("EnvironmentDetailForm — bearer scheme body 실행")
    func environmentDetailFormBearer() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .bearer
        env.bearerToken = "jwt-token"

        _ = EnvironmentDetailForm(env: env, project: project, store: envStore).body
    }

    @Test("EnvironmentDetailForm — basic scheme body 실행")
    func environmentDetailFormBasic() throws {
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
        env.basicPassword = "secret"

        _ = EnvironmentDetailForm(env: env, project: project, store: envStore).body
    }

    @Test("EnvironmentDetailForm — apiKey scheme body 실행")
    func environmentDetailFormAPIKey() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        let env = project.environments[0]
        env.authScheme = .apiKey
        env.apiKeyHeaderName = "X-API-Key"
        env.apiKeyValue = "secret-key"
        env.apiKeyInQuery = true

        _ = EnvironmentDetailForm(env: env, project: project, store: envStore).body
    }

    // MARK: - AddEnvironmentSheet

    @Test("AddEnvironmentSheet body 실행")
    func addEnvironmentSheetBody() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)

        _ = AddEnvironmentSheet(project: project, store: envStore).body
    }

    // MARK: - SchemeRow

    @Test("SchemeRow — apiKey scheme, not authorized body 실행")
    func schemeRowAPIKeyNotAuthorized() {
        let scheme = makeScheme(id: "apiKey", name: "apiKey",
                                kind: .apiKey(name: "X-API-Key", location: "header"),
                                description: "API Key authentication")
        var valueStr = ""
        _ = SchemeRow(
            scheme: scheme,
            value: Binding(get: { valueStr }, set: { valueStr = $0 }),
            isAuthorized: false, onAuthorize: {}, onLogout: {}
        ).body
    }

    @Test("SchemeRow — bearer scheme, authorized body 실행")
    func schemeRowBearerAuthorized() {
        let scheme = makeScheme(id: "bearer", name: "bearerAuth",
                                kind: .http(scheme: "bearer"),
                                description: "JWT Bearer token")
        var valueStr = "my-jwt-token"
        _ = SchemeRow(
            scheme: scheme,
            value: Binding(get: { valueStr }, set: { valueStr = $0 }),
            isAuthorized: true, onAuthorize: {}, onLogout: {}
        ).body
    }

    @Test("SchemeRow — basic scheme body 실행")
    func schemeRowBasic() {
        let scheme = makeScheme(id: "basic", name: "basicAuth", kind: .http(scheme: "basic"))
        var valueStr = ""
        _ = SchemeRow(
            scheme: scheme,
            value: Binding(get: { valueStr }, set: { valueStr = $0 }),
            isAuthorized: false, onAuthorize: {}, onLogout: {}
        ).body
    }

    @Test("SchemeRow — oauth2 scheme body 실행")
    func schemeRowOAuth2() {
        let scheme = makeScheme(id: "oauth2", name: "oauth2Auth", kind: .oauth2)
        var valueStr = ""
        _ = SchemeRow(
            scheme: scheme,
            value: Binding(get: { valueStr }, set: { valueStr = $0 }),
            isAuthorized: false, onAuthorize: {}, onLogout: {}
        ).body
    }

    @Test("SchemeRow — unknown scheme body 실행")
    func schemeRowUnknown() {
        let scheme = makeScheme(id: "unknown", name: "unknownAuth", kind: .unknown)
        var valueStr = ""
        _ = SchemeRow(
            scheme: scheme,
            value: Binding(get: { valueStr }, set: { valueStr = $0 }),
            isAuthorized: false, onAuthorize: {}, onLogout: {}
        ).body
    }

    // MARK: - WelcomeView

    @Test("WelcomeView body 실행")
    func welcomeViewBody() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)

        _ = WelcomeView(projectStore: projectStore, environmentStore: envStore).body
    }

    // MARK: - ProjectDetailForm

    @Test("ProjectDetailForm body 실행")
    func projectDetailFormBody() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "My API", swaggerURL: "https://api.com/openapi.json")
        let project = store.projects[0]

        _ = ProjectDetailForm(project: project, store: store).body
    }

    // MARK: - AddProjectSheet

    @Test("AddProjectSheet body 실행")
    func addProjectSheetBody() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let store = ProjectStore(modelContext: ctx)

        _ = AddProjectSheet(store: store).body
    }
}
