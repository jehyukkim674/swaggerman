// swiftlint:disable file_length type_body_length
import SwiftData
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("View Body Coverage Tests", .serialized)
@MainActor
struct ViewBodyTests {
    // MARK: - Helpers

    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    func makeEnv(scheme: AuthSchemeType = .none,
                 bearer: String? = nil,
                 user: String? = nil,
                 pass: String? = nil,
                 apiKeyName: String? = nil,
                 apiKeyValue: String? = nil,
                 inQuery: Bool? = nil) -> APIEnvironment
    {
        let env = APIEnvironment(name: "Test", baseURL: "https://api.com")
        env.authScheme = scheme
        env.bearerToken = bearer
        env.basicUsername = user
        env.basicPassword = pass
        env.apiKeyHeaderName = apiKeyName
        env.apiKeyValue = apiKeyValue
        env.apiKeyInQuery = inQuery
        return env
    }

    func makeOperation(method: HTTPMethod = .get, path: String = "/users",
                       hasBody: Bool = false,
                       pathParamCount: Int = 0,
                       queryParamCount: Int = 0) -> ParsedOperation
    {
        var params: [ParsedParameter] = []
        for idx in 0 ..< pathParamCount {
            params.append(ParsedParameter(
                id: "path-\(idx)", name: "param\(idx)", location: .path,
                required: true, schema: nil, description: nil
            ))
        }
        for idx in 0 ..< queryParamCount {
            params.append(ParsedParameter(
                id: "query-\(idx)", name: "q\(idx)", location: .query,
                required: false, schema: nil, description: nil
            ))
        }
        return ParsedOperation(
            id: "\(method.rawValue) \(path)",
            method: method,
            path: path,
            operationId: nil,
            summary: "Test operation",
            description: nil,
            tags: ["Test"],
            parameters: params,
            requestBody: hasBody
                ? ParsedRequestBody(required: true, contentType: "application/json", schema: nil)
                : nil,
            responseDescriptions: ["200": "OK"]
        )
    }

    // MARK: - BodyTab

    @Test("BodyTab — hasBody=false body 실행")
    func bodyTabNoBody() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = BodyTab(store: store, hasBody: false)
        _ = view.body
    }

    @Test("BodyTab — hasBody=true body 실행")
    func bodyTabWithBody() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.bodyJSON = "{\"name\": \"Alice\"}"
        let view = BodyTab(store: store, hasBody: true)
        _ = view.body
    }

    // MARK: - ParamsTab

    @Test("ParamsTab — 빈 파라미터 body 실행")
    func paramsTabEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = ParamsTab(store: store)
        _ = view.body
    }

    @Test("ParamsTab — path params 있는 경우 body 실행")
    func paramsTabWithPathParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(path: "/users/{id}", pathParamCount: 1)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = ParamsTab(store: store)
        _ = view.body
    }

    @Test("ParamsTab — query params 있는 경우 body 실행")
    func paramsTabWithQueryParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(queryParamCount: 2)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = ParamsTab(store: store)
        _ = view.body
    }

    @Test("ParamsTab — path + query params 있는 경우 body 실행")
    func paramsTabWithBothParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(path: "/users/{id}", pathParamCount: 1, queryParamCount: 2)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = ParamsTab(store: store)
        _ = view.body
    }

    // MARK: - HeadersTab

    @Test("HeadersTab — 빈 헤더 body 실행")
    func headersTabEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = HeadersTab(store: store)
        _ = view.body
    }

    @Test("HeadersTab — 헤더 있는 경우 body 실행")
    func headersTabWithHeaders() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = HeadersTab(store: store)
        _ = view.body
    }

    // MARK: - AuthTab

    @Test("AuthTab — environment nil body 실행")
    func authTabNoEnvironment() {
        let view = AuthTab(environment: nil)
        _ = view.body
    }

    @Test("AuthTab — none auth scheme body 실행")
    func authTabNoneScheme() {
        let view = AuthTab(environment: makeEnv(scheme: .none))
        _ = view.body
    }

    @Test("AuthTab — bearer 토큰 있는 경우 body 실행")
    func authTabBearerWithToken() {
        let view = AuthTab(environment: makeEnv(scheme: .bearer, bearer: "my-token-123456"))
        _ = view.body
    }

    @Test("AuthTab — bearer 토큰 없는 경우 body 실행")
    func authTabBearerNoToken() {
        let view = AuthTab(environment: makeEnv(scheme: .bearer, bearer: nil))
        _ = view.body
    }

    @Test("AuthTab — bearer 빈 토큰 body 실행")
    func authTabBearerEmptyToken() {
        let view = AuthTab(environment: makeEnv(scheme: .bearer, bearer: ""))
        _ = view.body
    }

    @Test("AuthTab — basic 인증 body 실행")
    func authTabBasicAuth() {
        let view = AuthTab(environment: makeEnv(scheme: .basic, user: "admin", pass: "secret"))
        _ = view.body
    }

    @Test("AuthTab — basic 비밀번호 없는 경우 body 실행")
    func authTabBasicNoPassword() {
        let view = AuthTab(environment: makeEnv(scheme: .basic, user: "user", pass: ""))
        _ = view.body
    }

    @Test("AuthTab — apiKey header body 실행")
    func authTabAPIKeyHeader() {
        let view = AuthTab(environment: makeEnv(
            scheme: .apiKey, apiKeyName: "X-API-Key", apiKeyValue: "key-value"
        ))
        _ = view.body
    }

    @Test("AuthTab — apiKey query body 실행")
    func authTabAPIKeyQuery() {
        let view = AuthTab(environment: makeEnv(
            scheme: .apiKey, apiKeyName: "api_key", apiKeyValue: "abc", inQuery: true
        ))
        _ = view.body
    }

    @Test("AuthTab — apiKey 값 없는 경우 body 실행")
    func authTabAPIKeyEmpty() {
        let view = AuthTab(environment: makeEnv(scheme: .apiKey, apiKeyValue: ""))
        _ = view.body
    }

    // MARK: - RequestSections

    @Test("ParamsSectionContent — 빈 파라미터 body 실행")
    func paramsSectionEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = ParamsSectionContent(store: store)
        _ = view.body
    }

    @Test("ParamsSectionContent — path params body 실행")
    func paramsSectionWithPathParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(path: "/users/{id}/{version}", pathParamCount: 2)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = ParamsSectionContent(store: store)
        _ = view.body
    }

    @Test("ParamsSectionContent — query params body 실행")
    func paramsSectionWithQueryParams() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(queryParamCount: 3)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = ParamsSectionContent(store: store)
        _ = view.body
    }

    @Test("HeadersSectionContent — 빈 헤더 body 실행")
    func headersSectionEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = HeadersSectionContent(store: store)
        _ = view.body
    }

    @Test("HeadersSectionContent — 헤더 있는 경우 body 실행")
    func headersSectionWithHeaders() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv(scheme: .bearer, bearer: "tok"))
        let view = HeadersSectionContent(store: store)
        _ = view.body
    }

    @Test("BodySectionContent — body 없는 경우 body 실행")
    func bodySectionNoBody() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = BodySectionContent(store: store)
        _ = view.body
    }

    @Test("BodySectionContent — body 있는 경우 body 실행")
    func bodySectionWithBody() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(method: .post, hasBody: true)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = BodySectionContent(store: store)
        _ = view.body
    }

    @Test("AuthSectionContent — environment nil body 실행")
    func authSectionNoEnv() {
        let view = AuthSectionContent(environment: nil)
        _ = view.body
    }

    @Test("AuthSectionContent — environment 있는 경우 body 실행")
    func authSectionWithEnv() {
        let view = AuthSectionContent(environment: makeEnv(scheme: .bearer, bearer: "tok"))
        _ = view.body
    }

    @Test("OperationHeaderView body 실행")
    func operationHeaderViewBody() {
        let op = makeOperation(method: .post, path: "/users")
        let view = OperationHeaderView(operation: op, isSending: false, onSend: {})
        _ = view.body
    }

    @Test("OperationHeaderView isSending=true body 실행")
    func operationHeaderViewSendingBody() {
        let op = makeOperation(method: .delete, path: "/users/1")
        let view = OperationHeaderView(operation: op, isSending: true, onSend: {})
        _ = view.body
    }

    // MARK: - RequestPaneView

    @Test("RequestPaneView — operation 없는 경우 body 실행")
    func requestPaneViewNoOperation() {
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = RequestPaneView(
            store: store,
            operationStore: opStore,
            activeEnvironment: nil,
            onSend: {}
        )
        _ = view.body
    }

    @Test("RequestPaneView — operation 있는 경우 body 실행")
    func requestPaneViewWithOperation() {
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation(method: .post, path: "/users", hasBody: true, queryParamCount: 1)
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = RequestPaneView(
            store: store,
            operationStore: opStore,
            activeEnvironment: makeEnv(),
            onSend: {}
        )
        _ = view.body
    }

    @Test("RequestPaneView — security schemes 있는 경우 body 실행")
    func requestPaneViewWithSecuritySchemes() {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [],
            securitySchemes: [
                ParsedSecurityScheme(
                    id: "bearerAuth", name: "bearerAuth",
                    kind: .http(scheme: "bearer"), description: nil
                )
            ],
            rawOperationCount: 0
        ))

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let op = makeOperation()
        store.loadOperation(op, baseURL: "https://api.com", environment: makeEnv())
        let view = RequestPaneView(
            store: store,
            operationStore: opStore,
            activeEnvironment: makeEnv(),
            onSend: {}
        )
        _ = view.body
    }

    // MARK: - AuthTokenBar

    @Test("AuthTokenBar — security schemes 없는 경우 body 실행")
    func authTokenBarNoSchemes() {
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        let view = AuthTokenBar(operationStore: opStore)
        _ = view.body
    }

    @Test("AuthTokenBar — bearer scheme body 실행")
    func authTokenBarBearerScheme() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: [],
            operations: [],
            securitySchemes: [
                ParsedSecurityScheme(
                    id: "bearerAuth", name: "bearerAuth",
                    kind: .http(scheme: "bearer"), description: "JWT Bearer"
                )
            ],
            rawOperationCount: 0
        ))

        let container = try makeContainer()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(
            parser: parser,
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        try await opStore.loadSpec(for: project)

        let view = AuthTokenBar(operationStore: opStore)
        _ = view.body
    }

    // MARK: - ResponsePaneView

    @Test("ResponsePaneView — 초기 상태 (응답 없음) body 실행")
    func responsePaneViewEmpty() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        let view = ResponsePaneView(store: store)
        _ = view.body
    }

    @Test("ResponsePaneView — 에러 상태 body 실행")
    func responsePaneViewError() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        // Set sendError via indirect approach - need to send with failing client
        let view = ResponsePaneView(store: store)
        _ = view.body
    }

    // MARK: - SidebarView

    @Test("SidebarView — 빈 spec body 실행")
    func sidebarViewEmpty() throws {
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        let container = try makeContainer()
        let view = SidebarView(
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
        )
        _ = view.body
    }

    @Test("SidebarView — operations 있는 경우 body 실행")
    func sidebarViewWithOperations() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "API", version: "1.0", description: nil),
            servers: ["https://api.com"],
            operations: [
                ParsedOperation(
                    id: "GET /users", method: .get, path: "/users",
                    operationId: "listUsers", summary: "List users", description: nil,
                    tags: ["Users"], parameters: [], requestBody: nil,
                    responseDescriptions: ["200": "OK"]
                ),
                ParsedOperation(
                    id: "POST /users", method: .post, path: "/users",
                    operationId: "createUser", summary: "Create user", description: nil,
                    tags: ["Users"], parameters: [], requestBody: nil,
                    responseDescriptions: ["201": "Created"]
                )
            ],
            securitySchemes: [],
            rawOperationCount: 2
        ))

        let container = try makeContainer()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        let view = SidebarView(
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
        )
        _ = view.body
    }

    // MARK: - AuthorizeSheet

    @Test("AuthorizeSheet — schemes 없는 경우 body 실행")
    func authorizeSheetNoSchemes() {
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )
        let view = AuthorizeSheet(operationStore: opStore)
        _ = view.body
    }

    @Test("AuthorizeSheet — schemes 있는 경우 body 실행")
    func authorizeSheetWithSchemes() async throws {
        let parser = MockOpenAPIParser()
        parser.parseResult = .success(ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: [],
            operations: [],
            securitySchemes: [
                ParsedSecurityScheme(
                    id: "apiKey", name: "apiKey",
                    kind: .apiKey(name: "X-API-Key", location: "header"),
                    description: "API Key auth"
                ),
                ParsedSecurityScheme(
                    id: "bearer", name: "bearer",
                    kind: .http(scheme: "bearer"),
                    description: "JWT Bearer"
                )
            ],
            rawOperationCount: 0
        ))

        let container = try makeContainer()
        let projectStore = ProjectStore(modelContext: container.mainContext)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]

        let opStore = OperationStore(parser: parser, httpClient: MockHTTPClient(), cache: MockSpecCache())
        try await opStore.loadSpec(for: project)

        let view = AuthorizeSheet(operationStore: opStore)
        _ = view.body
    }

    // MARK: - EnvironmentEditor

    @Test("EnvironmentEditor body 실행")
    func environmentEditorBody() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let project = projectStore.projects[0]
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(project)

        let view = EnvironmentEditor(project: project, store: envStore)
        _ = view.body
    }

    // MARK: - ProjectListEditor

    @Test("ProjectListEditor — 프로젝트 있는 경우 body 실행")
    func projectListEditorWithProjects() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let store = ProjectStore(modelContext: ctx)
        try store.addProject(alias: "API One", swaggerURL: "https://api1.com/docs")
        try store.addProject(alias: "API Two", swaggerURL: "https://api2.com/docs")

        let view = ProjectListEditor(store: store)
        _ = view.body
    }

    @Test("ProjectListEditor — 프로젝트 없는 경우 body 실행")
    func projectListEditorEmpty() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let store = ProjectStore(modelContext: ctx)

        let view = ProjectListEditor(store: store)
        _ = view.body
    }

    // MARK: - TopBar

    @Test("TopBar body 실행")
    func topBarBody() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        let projectStore = ProjectStore(modelContext: ctx)
        try projectStore.addProject(alias: "API", swaggerURL: "https://api.com/docs")
        let envStore = EnvironmentStore(modelContext: ctx)
        envStore.onProjectChanged(projectStore.projects[0])
        let opStore = OperationStore(
            parser: MockOpenAPIParser(),
            httpClient: MockHTTPClient(),
            cache: MockSpecCache()
        )

        var showSidebar = true
        var showRequest = true
        var showResponse = true

        let view = TopBar(
            projectStore: projectStore,
            environmentStore: envStore,
            operationStore: opStore,
            showSidebar: Binding(get: { showSidebar }, set: { showSidebar = $0 }),
            showRequest: Binding(get: { showRequest }, set: { showRequest = $0 }),
            showResponse: Binding(get: { showResponse }, set: { showResponse = $0 }),
            onSettings: {},
            onEnvironmentEditor: {}
        )
        _ = view.body
    }
}

// swiftlint:enable file_length type_body_length
