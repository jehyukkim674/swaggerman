import AppKit
import SwiftData
import SwiftUI
import Testing
@testable import SwaggerMan

/// These tests use NSHostingView to trigger SwiftUI's rendering pipeline,
/// which executes ForEach content closures and other deferred view builders
/// that are not covered by plain `.body` evaluation.
@Suite("View Body Render Tests", .serialized)
@MainActor
struct ViewBodyRenderTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func render(_ view: some View) {
        let hostingView = NSHostingView(rootView: view)
        hostingView.frame = CGRect(x: 0, y: 0, width: 400, height: 600)
        hostingView.layoutSubtreeIfNeeded()
    }

    func makeOp(method: HTTPMethod = .get, path: String = "/users",
                tag: String = "Users") -> ParsedOperation
    {
        ParsedOperation(
            id: "\(method.rawValue) \(path)", method: method, path: path,
            operationId: nil, summary: "Test \(method.rawValue)", description: nil,
            tags: [tag], parameters: [], requestBody: nil, responseDescriptions: ["200": "OK"]
        )
    }

    func makeScheme(id: String = "bearer", name: String = "bearerAuth",
                    kind: SecuritySchemeKind = .http(scheme: "bearer")) -> ParsedSecurityScheme
    {
        ParsedSecurityScheme(id: id, name: name, kind: kind, description: "Test scheme")
    }

    // MARK: - SidebarView rendering

    @Test("SidebarView — operations 있는 경우 render")
    func sidebarViewWithOperationsRender() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "T", version: "1.0", description: nil),
            servers: [],
            operations: [makeOp(method: .get), makeOp(method: .post, path: "/users")],
            securitySchemes: [],
            rawOperationCount: 2
        ))
        let container = try makeContainer()
        let project = Project(alias: "T", swaggerURL: "https://api.com")
        container.mainContext.insert(project)
        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        render(SidebarView(
            operationStore: opStore,
            selectedOperationID: "GET /users",
            onSelectOperation: { _ in },
            favoriteStore: FavoriteStore(modelContext: container.mainContext),
            project: project,
            onToggleFavorite: { _ in },
            historyStore: HistoryStore(modelContext: container.mainContext),
            onSelectHistory: { _ in },
            onReplayHistory: { _ in },
            onDeleteHistory: { _ in },
            onClearHistory: {}
        ))
    }

    @Test("SidebarView — 로딩 중 render")
    func sidebarViewLoadingRender() throws {
        let container = try makeContainer()
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        render(SidebarView(
            operationStore: opStore,
            selectedOperationID: nil,
            onSelectOperation: { _ in },
            favoriteStore: FavoriteStore(modelContext: container.mainContext),
            project: Project(alias: "T", swaggerURL: "https://api.com"),
            onToggleFavorite: { _ in },
            historyStore: HistoryStore(modelContext: container.mainContext),
            onSelectHistory: { _ in },
            onReplayHistory: { _ in },
            onDeleteHistory: { _ in },
            onClearHistory: {}
        ))
    }

    // MARK: - ProjectListEditor rendering

    @Test("ProjectListEditor — 프로젝트 선택된 경우 render")
    func projectListEditorWithSelectionRender() throws {
        let container = try makeContainer()
        let store = ProjectStore(modelContext: container.mainContext)
        try store.addProject(alias: "My API", swaggerURL: "https://api.com/openapi.json")
        let project = store.projects[0]
        store.selectProject(project)

        render(ProjectListEditor(store: store))
    }

    // MARK: - EnvironmentEditor rendering

    @Test("EnvironmentEditor — 환경 선택된 경우 render")
    func environmentEditorWithSelectionRender() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)
        try envStore.addEnvironment(name: "Staging", baseURL: "https://staging.api.com", to: project)

        render(EnvironmentEditor(project: project, store: envStore))
    }

    // MARK: - AuthorizeSheet rendering

    @Test("AuthorizeSheet — schemes 있는 경우 render")
    func authorizeSheetWithSchemesRender() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "T", version: "1.0", description: nil),
            servers: [],
            operations: [],
            securitySchemes: [
                makeScheme(id: "bearer", name: "bearerAuth"),
                makeScheme(id: "apiKey", name: "apiKeyAuth",
                           kind: .apiKey(name: "X-API-Key", location: "header"))
            ],
            rawOperationCount: 0
        ))
        let container = try makeContainer()
        let project = Project(alias: "T", swaggerURL: "https://api.com")
        container.mainContext.insert(project)
        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)
        opStore.securityValues["bearerAuth"] = "my-token"

        render(AuthorizeSheet(operationStore: opStore))
    }

    // MARK: - RequestPaneView rendering

    @Test("RequestPaneView — operation 선택된 경우 render")
    func requestPaneViewWithOperationRender() async throws {
        let op = makeOp(method: .post, path: "/users")
        let env = APIEnvironment(name: "Dev", baseURL: "https://api.com")
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.loadOperation(op, baseURL: "https://api.com", environment: env)

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "T", version: "1.0", description: nil),
            servers: [],
            operations: [op],
            securitySchemes: [makeScheme()],
            rawOperationCount: 1
        ))
        let container = try makeContainer()
        let project = Project(alias: "T", swaggerURL: "https://api.com")
        container.mainContext.insert(project)
        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        render(RequestPaneView(
            store: store,
            operationStore: opStore,
            activeEnvironment: env,
            onSend: {}
        ))
    }

    // MARK: - BodySectionContent.formatJSON

    @Test("BodySectionContent.formatJSON — 유효한 JSON 포맷팅")
    func bodySectionContentFormatJSONValid() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = #"{"key":"value","num":42}"#
        let view = BodySectionContent(store: store)
        view.formatJSON()
        #expect(store.bodyJSON.contains("\"key\""))
        #expect(store.bodyJSON.contains("\n"))
    }

    @Test("BodySectionContent.formatJSON — 유효하지 않은 JSON → 변경 없음")
    func bodySectionContentFormatJSONInvalid() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = "not json {"
        let view = BodySectionContent(store: store)
        view.formatJSON()
        #expect(store.bodyJSON == "not json {")
    }

    @Test("BodySectionContent.formatJSON — 빈 문자열 → 변경 없음")
    func bodySectionContentFormatJSONEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = ""
        let view = BodySectionContent(store: store)
        view.formatJSON()
        #expect(store.bodyJSON == "")
    }

    // MARK: - RootView.restoreLastOperation

    @Test("restoreLastOperation — lastOperationID 없을 때 early return")
    func restoreLastOperationNoID() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)

        let opStore = OperationStore(parser: MockOpenAPIParser(), httpClient: MockHTTPClient(), cache: MockSpecCache())
        let resStore = RequestEditorStore(httpClient: MockHTTPClient())

        let rootView = RootView()
        rootView.restoreLastOperation(project: project, os: opStore, es: envStore, res: resStore)
        #expect(resStore.selectedOperation == nil)
    }

    @Test("restoreLastOperation — 매칭 operation 있을 때 성공")
    func restoreLastOperationWithMatch() async throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)

        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "T", version: "1.0", description: nil),
            servers: [],
            operations: [makeOp(method: .get, path: "/users")],
            securitySchemes: [],
            rawOperationCount: 1
        ))
        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        project.lastOperationID = "GET /users"
        let resStore = RequestEditorStore(httpClient: MockHTTPClient())

        let rootView = RootView()
        rootView.restoreLastOperation(project: project, os: opStore, es: envStore, res: resStore)
        #expect(resStore.selectedOperation?.id == "GET /users")
    }
}
