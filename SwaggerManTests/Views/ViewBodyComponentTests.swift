// swiftlint:disable file_length type_body_length
import SwiftData
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("View Body Component Tests", .serialized)
@MainActor
struct ViewBodyComponentTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeScheme(id: String = "auth", name: String = "auth",
                    kind: SecuritySchemeKind = .http(scheme: "bearer"),
                    description: String? = nil) -> ParsedSecurityScheme
    {
        ParsedSecurityScheme(id: id, name: name, kind: kind, description: description)
    }

    func makeOp(method: HTTPMethod = .get, path: String = "/users",
                summary: String? = "Test op") -> ParsedOperation
    {
        ParsedOperation(
            id: "\(method.rawValue) \(path)", method: method, path: path,
            operationId: nil, summary: summary, description: nil,
            tags: [], parameters: [], requestBody: nil, responseDescriptions: [:]
        )
    }

    // MARK: - SearchBarView

    @Test("SearchBarView — empty text body 실행")
    func searchBarViewEmpty() {
        var text = ""
        _ = SearchBarView(text: Binding(get: { text }, set: { text = $0 })).body
    }

    @Test("SearchBarView — non-empty text body 실행")
    func searchBarViewWithText() {
        var text = "POST /users"
        _ = SearchBarView(text: Binding(get: { text }, set: { text = $0 })).body
    }

    // MARK: - TagFilterView

    @Test("TagFilterView — selectedTag nil body 실행")
    func tagFilterViewNoSelection() {
        var selectedTag: String?
        _ = TagFilterView(
            tags: ["Users", "Posts", "Auth"],
            selectedTag: Binding(get: { selectedTag }, set: { selectedTag = $0 })
        ).body
    }

    @Test("TagFilterView — selectedTag 있는 경우 body 실행")
    func tagFilterViewWithSelection() {
        var selectedTag: String? = "Users"
        _ = TagFilterView(
            tags: ["Users", "Posts", "Auth"],
            selectedTag: Binding(get: { selectedTag }, set: { selectedTag = $0 })
        ).body
    }

    // MARK: - MethodFilterView

    @Test("MethodFilterView — 선택 없는 경우 body 실행")
    func methodFilterViewEmpty() {
        var methods = Set<HTTPMethod>()
        _ = MethodFilterView(selectedMethods: Binding(get: { methods }, set: { methods = $0 })).body
    }

    @Test("MethodFilterView — GET POST DELETE 선택된 경우 body 실행")
    func methodFilterViewWithSelection() {
        var methods: Set<HTTPMethod> = [.get, .post, .delete]
        _ = MethodFilterView(selectedMethods: Binding(get: { methods }, set: { methods = $0 })).body
    }

    // MARK: - OperationRowView

    @Test("OperationRowView — selected, summary 있는 경우 body 실행")
    func operationRowViewSelectedWithSummary() {
        _ = OperationRowView(operation: makeOp(method: .post, summary: "Create user"), isSelected: true).body
    }

    @Test("OperationRowView — not selected, summary 없는 경우 body 실행")
    func operationRowViewNotSelectedNoSummary() {
        _ = OperationRowView(operation: makeOp(method: .delete, summary: nil), isSelected: false).body
    }

    @Test("OperationRowView — 모든 HTTP 메소드 body 실행")
    func operationRowViewAllMethods() {
        for method in [HTTPMethod.get, .post, .put, .delete, .patch] {
            _ = OperationRowView(operation: makeOp(method: method), isSelected: method == .get).body
        }
    }

    // MARK: - SidebarView states

    @Test("SidebarView — loadError 있는 경우 body 실행")
    func sidebarViewWithLoadError() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .failure(SwaggerManError.parsing(.invalidJSON("Parse failed")))

        let container = try makeContainer()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try? await opStore.loadSpec(for: project)

        _ = SidebarView(
            operationStore: opStore,
            selectedOperationID: nil,
            onSelectOperation: { _ in },
            favoriteStore: FavoriteStore(modelContext: container.mainContext),
            project: project,
            onToggleFavorite: { _ in },
            historyStore: HistoryStore(modelContext: container.mainContext),
            onSelectHistory: { _ in },
            onReplayHistory: { _ in },
            onDeleteHistory: { _ in },
            onClearHistory: {}
        ).body
    }

    @Test("SidebarView — selectedTag 있는 경우 body 실행")
    func sidebarViewWithSelectedTag() async throws {
        let container = try makeContainer()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: MockOpenAPIParser(), httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)
        opStore.selectedTag = "Users"

        _ = SidebarView(
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
        ).body
    }

    // MARK: - AuthTokenRow

    @Test("AuthTokenRow — apiKey scheme, authorized body 실행")
    func authTokenRowAPIKeyAuthorized() {
        let scheme = makeScheme(id: "apiKey", name: "apiKey",
                                kind: .apiKey(name: "X-API-Key", location: "header"))
        var value = "secret-api-key"
        _ = AuthTokenRow(
            scheme: scheme,
            value: Binding(get: { value }, set: { value = $0 }),
            isAuthorized: true
        ).body
    }

    @Test("AuthTokenRow — bearer scheme, not authorized body 실행")
    func authTokenRowBearerNotAuthorized() {
        let scheme = makeScheme(id: "bearer", name: "bearerAuth", kind: .http(scheme: "bearer"))
        var value = ""
        _ = AuthTokenRow(
            scheme: scheme,
            value: Binding(get: { value }, set: { value = $0 }),
            isAuthorized: false
        ).body
    }

    @Test("AuthTokenRow — oauth2 scheme body 실행")
    func authTokenRowOAuth2() {
        let scheme = makeScheme(id: "oauth2", name: "oauth2Auth", kind: .oauth2)
        var value = ""
        _ = AuthTokenRow(
            scheme: scheme,
            value: Binding(get: { value }, set: { value = $0 }),
            isAuthorized: false
        ).body
    }

    @Test("AuthTokenRow — unknown scheme body 실행")
    func authTokenRowUnknown() {
        let scheme = makeScheme(id: "unknown", name: "unknownAuth", kind: .unknown)
        var value = "some-token"
        _ = AuthTokenRow(
            scheme: scheme,
            value: Binding(get: { value }, set: { value = $0 }),
            isAuthorized: true
        ).body
    }

    // MARK: - TopBar states

    @Test("TopBar — security schemes 있는 경우, authorized count > 0 body 실행")
    func topBarWithSecuritySchemesAndAuthorized() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Secure API", version: "1.0", description: nil),
            servers: [],
            operations: [],
            securitySchemes: [makeScheme(id: "bearer", name: "bearerAuth")],
            rawOperationCount: 0
        ))

        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "Secure API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)
        opStore.securityValues["bearerAuth"] = "my-token"

        var showSidebar = true
        var showRequest = true
        var showResponse = true

        _ = TopBar(
            projectStore: projectStore,
            environmentStore: envStore,
            operationStore: opStore,
            showSidebar: Binding(get: { showSidebar }, set: { showSidebar = $0 }),
            showRequest: Binding(get: { showRequest }, set: { showRequest = $0 }),
            showResponse: Binding(get: { showResponse }, set: { showResponse = $0 }),
            onSettings: {},
            onEnvironmentEditor: {}
        ).body
    }

    @Test("TopBar — selectedProject nil body 실행")
    func topBarNoSelectedProject() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        let envStore = EnvironmentStore(modelContext: ctx)
        let opStore = OperationStore(parser: MockOpenAPIParser(), httpClient: MockHTTPClient(), cache: MockSpecCache())

        var showSidebar = false
        var showRequest = false
        var showResponse = false

        _ = TopBar(
            projectStore: projectStore,
            environmentStore: envStore,
            operationStore: opStore,
            showSidebar: Binding(get: { showSidebar }, set: { showSidebar = $0 }),
            showRequest: Binding(get: { showRequest }, set: { showRequest = $0 }),
            showResponse: Binding(get: { showResponse }, set: { showResponse = $0 }),
            onSettings: {},
            onEnvironmentEditor: {}
        ).body
    }

    // MARK: - ParamsTab subviews

    @Test("ParamSection body 실행")
    func paramSectionBody() {
        _ = ParamSection(title: "Path Parameters") { Text("param content") }.body
    }

    @Test("ParamsTabInputRow body 실행")
    func paramsTabInputRowBody() {
        var value = "123"
        _ = ParamsTabInputRow(
            label: "{id}", placeholder: "값 입력",
            value: Binding(get: { value }, set: { value = $0 })
        ).body
    }

    @Test("ParamsTabQueryInputRow — enabled=true body 실행")
    func paramsTabQueryRowEnabled() {
        var param = RequestParam(key: "q", value: "search term", enabled: true)
        _ = ParamsTabQueryInputRow(param: Binding(get: { param }, set: { param = $0 })).body
    }

    @Test("ParamsTabQueryInputRow — enabled=false body 실행")
    func paramsTabQueryRowDisabled() {
        var param = RequestParam(key: "q", value: "disabled", enabled: false)
        _ = ParamsTabQueryInputRow(param: Binding(get: { param }, set: { param = $0 })).body
    }

    // MARK: - HeadersTab subviews

    @Test("HeadersTabInputRow — enabled=true body 실행")
    func headersTabInputRowEnabled() {
        var header = RequestParam(key: "X-Custom-Header", value: "value123", enabled: true)
        _ = HeadersTabInputRow(
            header: Binding(get: { header }, set: { header = $0 }),
            onDelete: {}
        ).body
    }

    @Test("HeadersTabInputRow — enabled=false body 실행")
    func headersTabInputRowDisabled() {
        var header = RequestParam(key: "X-Custom-Header", value: "value123", enabled: false)
        _ = HeadersTabInputRow(
            header: Binding(get: { header }, set: { header = $0 }),
            onDelete: {}
        ).body
    }

    @Test("HeadersTab — disabled headers 있는 경우 body 실행")
    func headersTabWithDisabledHeaders() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.requestHeaders = [
            RequestParam(key: "X-Active", value: "yes", enabled: true),
            RequestParam(key: "X-Disabled", value: "no", enabled: false)
        ]
        _ = HeadersTab(store: store).body
    }

    // MARK: - RequestSection

    @Test("RequestSection — expanded with badge body 실행")
    func requestSectionExpandedWithBadge() {
        _ = RequestSection(title: "Headers", badge: "3", defaultExpanded: true) {
            Text("content")
        }.body
    }

    @Test("RequestSection — collapsed body 실행")
    func requestSectionCollapsed() {
        _ = RequestSection(title: "Body", defaultExpanded: false) {
            Text("content")
        }.body
    }

    // MARK: - HeaderInputRow spec headers

    @Test("HeaderInputRow — isFromSpec=true, required body 실행")
    func headerInputRowSpecRequired() {
        var header = RequestParam(key: "X-API-Key", value: "", enabled: true,
                                  isFromSpec: true, isRequired: true)
        _ = HeaderInputRow(
            header: Binding(get: { header }, set: { header = $0 }),
            onDelete: {}
        ).body
    }

    @Test("HeaderInputRow — isFromSpec=true, not required body 실행")
    func headerInputRowSpecNotRequired() {
        var header = RequestParam(key: "Accept", value: "application/json", enabled: true,
                                  isFromSpec: true, isRequired: false)
        _ = HeaderInputRow(
            header: Binding(get: { header }, set: { header = $0 }),
            onDelete: {}
        ).body
    }

    @Test("HeaderInputRow — user header disabled body 실행")
    func headerInputRowUserDisabled() {
        var header = RequestParam(key: "X-Custom", value: "val", enabled: false)
        _ = HeaderInputRow(
            header: Binding(get: { header }, set: { header = $0 }),
            onDelete: {}
        ).body
    }

    // MARK: - PanelDivider

    @Test("PanelDivider body 실행")
    func panelDividerBody() {
        _ = PanelDivider { _ in }.body
    }

    // MARK: - AuthTokenBar

    @Test("AuthTokenBar — schemes 없는 경우 body 실행")
    func authTokenBarNoSchemes() {
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        _ = AuthTokenBar(operationStore: opStore).body
    }

    @Test("AuthTokenBar — schemes 있고 authorized count > 0 body 실행")
    func authTokenBarWithAuthorizedSchemes() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "T", version: "1.0", description: nil),
            servers: [],
            operations: [],
            securitySchemes: [
                ParsedSecurityScheme(id: "bearer", name: "bearerAuth",
                                     kind: .http(scheme: "bearer"), description: nil)
            ],
            rawOperationCount: 0
        ))
        let container = try makeContainer()
        let project = Project(alias: "T", swaggerURL: "https://api.com")
        container.mainContext.insert(project)
        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)
        opStore.securityValues["bearerAuth"] = "my-token"
        _ = AuthTokenBar(operationStore: opStore).body
    }

    @Test("AuthTokenBar — schemes 있지만 미인증 body 실행")
    func authTokenBarWithUnauthSchemes() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "T", version: "1.0", description: nil),
            servers: [],
            operations: [],
            securitySchemes: [
                ParsedSecurityScheme(id: "key", name: "apiKey",
                                     kind: .apiKey(name: "X-Key", location: "header"), description: nil)
            ],
            rawOperationCount: 0
        ))
        let container = try makeContainer()
        let project = Project(alias: "T", swaggerURL: "https://api.com")
        container.mainContext.insert(project)
        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)
        _ = AuthTokenBar(operationStore: opStore).body
    }

    // MARK: - BodyTab

    @Test("BodyTab — hasBody=true body 실행")
    func bodyTabWithBodyTrue() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = #"{"key":"value"}"#
        _ = BodyTab(store: store, hasBody: true).body
    }

    @Test("BodyTab — hasBody=false body 실행")
    func bodyTabWithBodyFalse() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        _ = BodyTab(store: store, hasBody: false).body
    }
}

// swiftlint:enable file_length type_body_length
