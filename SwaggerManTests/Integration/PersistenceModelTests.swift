import Foundation
import SwiftData
import Testing
@testable import SwaggerMan

@Suite("Persistence Model Tests", .serialized)
@MainActor
struct PersistenceModelTests {
    func makeContainer() throws -> ModelContainer {
        try ModelContainerFactory.makeInMemory()
    }

    @Test("AuthSchemeType displayName — all cases")
    func authSchemeDisplayNames() {
        #expect(AuthSchemeType.none.displayName == "없음")
        #expect(AuthSchemeType.bearer.displayName == "Bearer Token")
        #expect(AuthSchemeType.basic.displayName == "Basic Auth")
        #expect(AuthSchemeType.apiKey.displayName == "API Key")
    }

    @Test("AuthSchemeType CaseIterable — 4 cases")
    func authSchemeCaseIterable() {
        #expect(AuthSchemeType.allCases.count == 4)
    }

    @Test("AuthSchemeType rawValues")
    func authSchemeRawValues() {
        #expect(AuthSchemeType.none.rawValue == "none")
        #expect(AuthSchemeType.bearer.rawValue == "bearer")
        #expect(AuthSchemeType.basic.rawValue == "basic")
        #expect(AuthSchemeType.apiKey.rawValue == "apiKey")
    }

    @Test("APIEnvironment init defaults")
    func apiEnvironmentInit() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let env = APIEnvironment(name: "Production", baseURL: "https://prod.api.com")
        ctx.insert(env)

        #expect(env.name == "Production")
        #expect(env.baseURL == "https://prod.api.com")
        #expect(env.authScheme == .none)
        #expect(env.bearerToken == nil)
        #expect(env.basicUsername == nil)
        #expect(env.basicPassword == nil)
        #expect(env.apiKeyValue == nil)
        #expect(env.apiKeyHeaderName == nil)
        #expect(env.apiKeyInQuery == nil)
        #expect(env.disableTLSValidation == false)
    }

    @Test("FavoriteOperation init and properties")
    func favoriteOperationInit() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let fav = FavoriteOperation(method: "GET", path: "/users", sortOrder: 0)
        ctx.insert(fav)

        #expect(fav.method == "GET")
        #expect(fav.path == "/users")
        #expect(fav.sortOrder == 0)
        #expect(fav.project == nil)
    }

    @Test("FavoriteOperation init with project")
    func favoriteOperationInitWithProject() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let project = Project(alias: "My API", swaggerURL: "https://api.com/docs")
        ctx.insert(project)

        let fav = FavoriteOperation(method: "POST", path: "/orders", sortOrder: 1, project: project)
        ctx.insert(fav)

        #expect(fav.method == "POST")
        #expect(fav.path == "/orders")
        #expect(fav.sortOrder == 1)
        #expect(fav.project?.alias == "My API")
    }

    @Test("RequestCollection init and properties")
    func requestCollectionInit() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let col = RequestCollection(name: "Auth Tests", sortOrder: 2)
        ctx.insert(col)

        #expect(col.name == "Auth Tests")
        #expect(col.sortOrder == 2)
        #expect(col.requests.isEmpty)
        #expect(col.project == nil)
    }

    @Test("RequestCollection init with project")
    func requestCollectionInitWithProject() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let project = Project(alias: "API", swaggerURL: "https://api.com/docs")
        ctx.insert(project)

        let col = RequestCollection(name: "User Tests", sortOrder: 0, project: project)
        ctx.insert(col)

        #expect(col.name == "User Tests")
        #expect(col.project?.alias == "API")
    }

    @Test("SavedRequest init and defaults")
    func savedRequestInit() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let req = SavedRequest(name: "Get All Users", method: "GET", path: "/users")
        ctx.insert(req)

        #expect(req.name == "Get All Users")
        #expect(req.method == "GET")
        #expect(req.path == "/users")
        #expect(req.pathParamsJSON == "{}")
        #expect(req.queryParamsJSON == "{}")
        #expect(req.headersJSON == "{}")
        #expect(req.bodyJSON == nil)
        #expect(req.sortOrder == 0)
        #expect(req.collection == nil)
    }

    @Test("SavedRequest init with collection")
    func savedRequestInitWithCollection() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let col = RequestCollection(name: "Users", sortOrder: 0)
        ctx.insert(col)

        let req = SavedRequest(name: "Create User", method: "POST", path: "/users",
                               collection: col)
        ctx.insert(req)

        #expect(req.collection?.name == "Users")
        #expect(req.name == "Create User")
    }

    @Test("HistoryItem init and properties")
    func historyItemInit() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let envID = UUID()
        let item = HistoryItem(
            environmentID: envID,
            method: "DELETE",
            path: "/users/42",
            fullURL: "https://api.com/users/42",
            requestHeadersJSON: "{\"Authorization\":\"Bearer token\"}",
            requestBody: nil,
            responseStatus: 204,
            responseHeadersJSON: "{}",
            responseBody: "",
            responseSize: 0,
            durationMs: 15
        )
        ctx.insert(item)

        #expect(item.environmentID == envID)
        #expect(item.method == "DELETE")
        #expect(item.path == "/users/42")
        #expect(item.responseStatus == 204)
        #expect(item.durationMs == 15)
        #expect(item.requestBody == nil)
    }

    @Test("Project init and properties")
    func projectInit() throws {
        let container = try makeContainer()
        let ctx = container.mainContext
        _ = container

        let project = Project(alias: "Test API", swaggerURL: "https://test.api.com/docs")
        ctx.insert(project)

        #expect(project.alias == "Test API")
        #expect(project.swaggerURL == "https://test.api.com/docs")
        #expect(project.lastOperationID == nil)
        #expect(project.environments.isEmpty)
        #expect(project.history.isEmpty)
        #expect(project.favorites.isEmpty)
        #expect(project.collections.isEmpty)
    }
}
