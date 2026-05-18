import Foundation
import Testing
@testable import SwaggerMan

private let openAPI30WithSecurityJSON = """
{
  "openapi": "3.0.0",
  "info": { "title": "Secure API", "version": "1.0.0" },
  "paths": {
    "/data": {
      "get": {
        "summary": "Get data",
        "tags": ["Data"],
        "security": [{"apiKeyAuth": []}],
        "responses": { "200": { "description": "OK" } }
      }
    }
  },
  "components": {
    "securitySchemes": {
      "apiKeyAuth": {
        "type": "apiKey",
        "name": "X-API-Key",
        "in": "header"
      },
      "bearerAuth": {
        "type": "http",
        "scheme": "bearer"
      },
      "basicAuth": {
        "type": "http",
        "scheme": "basic"
      },
      "oauth2Auth": {
        "type": "oauth2",
        "flows": {
          "clientCredentials": {
            "tokenUrl": "https://auth.example.com/token",
            "scopes": {}
          }
        }
      }
    }
  }
}
"""

private let openAPI30WithAllSchemaTypes = """
{
  "openapi": "3.0.0",
  "info": { "title": "Schema Test", "version": "1.0.0" },
  "paths": {
    "/data": {
      "post": {
        "summary": "Create",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": ["name", "age"],
                "properties": {
                  "name": { "type": "string", "example": "Alice", "description": "User name" },
                  "age": { "type": "integer", "default": 18 },
                  "score": { "type": "number" },
                  "active": { "type": "boolean" },
                  "tags": {
                    "type": "array",
                    "items": { "type": "string" }
                  },
                  "status": {
                    "type": "string",
                    "enum": ["active", "inactive", "pending"]
                  }
                }
              }
            }
          }
        },
        "responses": { "201": { "description": "Created" } }
      }
    },
    "/items": {
      "get": {
        "summary": "List items",
        "parameters": [
          {
            "name": "X-Request-ID",
            "in": "header",
            "required": true,
            "schema": { "type": "string" }
          },
          {
            "name": "sessionId",
            "in": "cookie",
            "required": false,
            "schema": { "type": "string" }
          }
        ],
        "responses": { "200": { "description": "OK" } }
      }
    }
  }
}
"""

private let openAPI20YAML = """
swagger: "2.0"
info:
  title: Old API
  version: "1.0.0"
paths: {}
"""

private let invalidYAML = """
this is not valid yaml: [
  unclosed bracket
"""

@Suite("OpenAPIParser Additional Tests", .serialized)
struct OpenAPIParserAdditionalTests {
    let parser = OpenAPIParser()

    @Test("security schemes 파싱 — apiKey, bearer, basic, oauth2")
    func parsesAllSecuritySchemeTypes() throws {
        let data = try #require(openAPI30WithSecurityJSON.data(using: .utf8))
        let spec = try parser.parse(data)

        #expect(spec.securitySchemes.count == 4)

        let apiKey = spec.securitySchemes.first { $0.name == "apiKeyAuth" }
        #expect(apiKey != nil)
        if case let .apiKey(name, location) = apiKey?.kind {
            #expect(name == "X-API-Key")
            #expect(location == "header")
        } else {
            Issue.record("Expected apiKey kind")
        }

        let bearer = spec.securitySchemes.first { $0.name == "bearerAuth" }
        #expect(bearer != nil)
        if case let .http(scheme) = bearer?.kind {
            #expect(scheme == "bearer")
        } else {
            Issue.record("Expected http(bearer) kind")
        }

        let basic = spec.securitySchemes.first { $0.name == "basicAuth" }
        #expect(basic != nil)
        if case let .http(scheme) = basic?.kind {
            #expect(scheme == "basic")
        } else {
            Issue.record("Expected http(basic) kind")
        }

        let oauth2 = spec.securitySchemes.first { $0.name == "oauth2Auth" }
        #expect(oauth2 != nil)
        if case .oauth2 = oauth2?.kind { /* correct */ } else {
            Issue.record("Expected oauth2 kind")
        }
    }

    @Test("모든 schema 타입 파싱 — string, integer, number, boolean, array, object, enum")
    func parsesAllSchemaTypes() throws {
        let data = try #require(openAPI30WithAllSchemaTypes.data(using: .utf8))
        let spec = try parser.parse(data)

        let postOp = spec.operations.first { $0.method == .post }
        #expect(postOp?.requestBody != nil)
        let schema = postOp?.requestBody?.schema
        #expect(schema?.type == .object)
        #expect(schema?.required?.contains("name") == true)
        #expect(schema?.required?.contains("age") == true)

        let nameSchema = schema?.properties?["name"]
        #expect(nameSchema?.type == .string)
        #expect(nameSchema?.example == "Alice")
        #expect(nameSchema?.description == "User name")

        let ageSchema = schema?.properties?["age"]
        #expect(ageSchema?.type == .integer)
        #expect(ageSchema?.defaultValue == "18")

        let scoreSchema = schema?.properties?["score"]
        #expect(scoreSchema?.type == .number)

        let activeSchema = schema?.properties?["active"]
        #expect(activeSchema?.type == .boolean)

        let tagsSchema = schema?.properties?["tags"]
        #expect(tagsSchema?.type == .array)
        #expect(tagsSchema?.items?.type == .string)

        let statusSchema = schema?.properties?["status"]
        #expect(statusSchema?.enumValues?.contains("active") == true)
        #expect(statusSchema?.enumValues?.contains("inactive") == true)
    }

    @Test("header 파라미터 location = .header")
    func parsesHeaderParameter() throws {
        let data = try #require(openAPI30WithAllSchemaTypes.data(using: .utf8))
        let spec = try parser.parse(data)

        let getItems = spec.operations.first { $0.path == "/items" }
        let xRequestID = getItems?.parameters.first { $0.name == "X-Request-ID" }
        #expect(xRequestID?.location == .header)
        #expect(xRequestID?.required == true)
    }

    @Test("cookie 파라미터 location = .cookie")
    func parsesCookieParameter() throws {
        let data = try #require(openAPI30WithAllSchemaTypes.data(using: .utf8))
        let spec = try parser.parse(data)

        let getItems = spec.operations.first { $0.path == "/items" }
        let sessionId = getItems?.parameters.first { $0.name == "sessionId" }
        #expect(sessionId?.location == .cookie)
        #expect(sessionId?.required == false)
    }

    @Test("YAML OpenAPI 2.0 → 에러 throw")
    func rejectsYAML20() throws {
        #expect(throws: SwaggerManError.self) {
            _ = try parser.parseYAML(openAPI20YAML)
        }
    }

    @Test("잘못된 YAML → SwaggerManError throw")
    func throwsOnInvalidYAML() throws {
        let badYaml = "not: {valid: yaml: at: all:"
        #expect(throws: SwaggerManError.self) {
            _ = try parser.parseYAML(badYaml)
        }
    }

    @Test("빈 JSON → SwaggerManError throw")
    func throwsOnEmptyJSON() throws {
        let data = Data("{}".utf8)
        #expect(throws: SwaggerManError.self) {
            _ = try parser.parse(data)
        }
    }

    @Test("info.description 파싱")
    func parsesInfoDescription() throws {
        let json = """
        {
          "openapi": "3.0.0",
          "info": {
            "title": "API with description",
            "version": "2.0.0",
            "description": "This is a detailed API description"
          },
          "paths": {}
        }
        """
        let data = try #require(json.data(using: .utf8))
        let spec = try parser.parse(data)
        #expect(spec.info.description == "This is a detailed API description")
        #expect(spec.info.version == "2.0.0")
    }

    @Test("operations 정렬 — securitySchemes 알파벳 순")
    func securitySchemesSorted() throws {
        let data = try #require(openAPI30WithSecurityJSON.data(using: .utf8))
        let spec = try parser.parse(data)

        let names = spec.securitySchemes.map(\.name)
        #expect(names == names.sorted())
    }
}
