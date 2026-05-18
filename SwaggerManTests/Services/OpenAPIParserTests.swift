import Foundation
import Testing
@testable import SwaggerMan

// MARK: - Fixtures

private let validOpenAPI30JSON = """
{
  "openapi": "3.0.0",
  "info": { "title": "Test API", "version": "1.0.0" },
  "servers": [{ "url": "https://api.example.com" }],
  "paths": {
    "/users": {
      "get": {
        "summary": "List users",
        "operationId": "listUsers",
        "tags": ["Users"],
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": { "type": "integer" }
          }
        ],
        "responses": { "200": { "description": "Success" } }
      },
      "post": {
        "summary": "Create user",
        "operationId": "createUser",
        "tags": ["Users"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name"],
                "properties": {
                  "name": { "type": "string" },
                  "age": { "type": "integer" }
                }
              }
            }
          }
        },
        "responses": { "201": { "description": "Created" } }
      }
    },
    "/users/{id}": {
      "get": {
        "summary": "Get user",
        "tags": ["Users"],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": { "200": { "description": "User found" } }
      }
    }
  }
}
"""

private let openAPI20JSON = """
{
  "swagger": "2.0",
  "info": { "title": "Old API", "version": "1.0.0" },
  "paths": {}
}
"""

@Suite("OpenAPIParser Tests", .serialized)
struct OpenAPIParserTests {
    let parser = OpenAPIParser()

    @Test("유효한 OpenAPI 3.0 JSON 파싱 → 오퍼레이션 3개")
    func parsesValidJSON() throws {
        let data = try #require(validOpenAPI30JSON.data(using: .utf8))
        let spec = try parser.parse(data)

        #expect(spec.operations.count == 3)
        #expect(spec.info.title == "Test API")
        #expect(spec.servers.first == "https://api.example.com")
    }

    @Test("GET /users 오퍼레이션 필드 검증")
    func parsesGetOperation() throws {
        let data = try #require(validOpenAPI30JSON.data(using: .utf8))
        let spec = try parser.parse(data)

        let getUsers = spec.operations.first { $0.method == .get && $0.path == "/users" }
        #expect(getUsers != nil)
        #expect(getUsers?.summary == "List users")
        #expect(getUsers?.tags == ["Users"])
        #expect(getUsers?.parameters.first?.name == "limit")
        #expect(getUsers?.parameters.first?.location == .query)
    }

    @Test("POST /users requestBody 파싱")
    func parsesRequestBody() throws {
        let data = try #require(validOpenAPI30JSON.data(using: .utf8))
        let spec = try parser.parse(data)

        let post = spec.operations.first { $0.method == .post && $0.path == "/users" }
        #expect(post?.requestBody != nil)
        #expect(post?.requestBody?.required == true)
    }

    @Test("path 파라미터 location = .path")
    func parsesPathParameter() throws {
        let data = try #require(validOpenAPI30JSON.data(using: .utf8))
        let spec = try parser.parse(data)

        let getUser = spec.operations.first { $0.path == "/users/{id}" }
        let idParam = getUser?.parameters.first { $0.name == "id" }
        #expect(idParam?.location == .path)
        #expect(idParam?.required == true)
    }

    @Test("OpenAPI 2.0 입력 시 SwaggerManError throw")
    func rejectsOpenAPI20() throws {
        let data = try #require(openAPI20JSON.data(using: .utf8))

        #expect(throws: SwaggerManError.self) {
            _ = try parser.parse(data)
        }
    }

    @Test("잘못된 JSON 입력 시 SwaggerManError throw")
    func throwsOnInvalidJSON() throws {
        let data = Data("{ invalid json }".utf8)

        #expect(throws: SwaggerManError.self) {
            _ = try parser.parse(data)
        }
    }

    @Test("YAML 입력 파싱")
    func parsesYAML() throws {
        let yaml = """
        openapi: "3.0.0"
        info:
          title: YAML API
          version: "1.0.0"
        paths:
          /health:
            get:
              summary: Health check
              responses:
                "200":
                  description: OK
        """
        let spec = try parser.parseYAML(yaml)
        #expect(spec.info.title == "YAML API")
        #expect(spec.operations.count == 1)
        #expect(spec.operations.first?.path == "/health")
    }
}
