import Foundation
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("HTTPMethod Tests")
struct HTTPMethodTests {
    @Test("color — all cases return non-empty string")
    func colorAllCases() {
        for method in HTTPMethod.allCases {
            #expect(!method.color.isEmpty)
        }
    }

    @Test("color — specific values")
    func colorValues() {
        #expect(HTTPMethod.get.color == "green")
        #expect(HTTPMethod.post.color == "blue")
        #expect(HTTPMethod.put.color == "orange")
        #expect(HTTPMethod.delete.color == "red")
        #expect(HTTPMethod.patch.color == "purple")
        #expect(HTTPMethod.options.color == "gray")
        #expect(HTTPMethod.head.color == "gray")
    }

    @Test("swiftUIColor — all cases return Color")
    func swiftUIColorAllCases() {
        #expect(HTTPMethod.get.swiftUIColor == .green)
        #expect(HTTPMethod.post.swiftUIColor == .blue)
        #expect(HTTPMethod.put.swiftUIColor == .orange)
        #expect(HTTPMethod.delete.swiftUIColor == .red)
        #expect(HTTPMethod.patch.swiftUIColor == .purple)
        #expect(HTTPMethod.options.swiftUIColor == .gray)
        #expect(HTTPMethod.head.swiftUIColor == .gray)
    }

    @Test("sfSymbol — all cases return non-empty string")
    func sfSymbolAllCases() {
        #expect(!HTTPMethod.get.sfSymbol.isEmpty)
        #expect(!HTTPMethod.post.sfSymbol.isEmpty)
        #expect(!HTTPMethod.put.sfSymbol.isEmpty)
        #expect(!HTTPMethod.delete.sfSymbol.isEmpty)
        #expect(!HTTPMethod.patch.sfSymbol.isEmpty)
        #expect(!HTTPMethod.options.sfSymbol.isEmpty)
        #expect(!HTTPMethod.head.sfSymbol.isEmpty)
    }

    @Test("sfSymbol — specific values")
    func sfSymbolValues() {
        #expect(HTTPMethod.get.sfSymbol == "arrow.down.circle.fill")
        #expect(HTTPMethod.post.sfSymbol == "plus.circle.fill")
        #expect(HTTPMethod.put.sfSymbol == "arrow.up.circle.fill")
        #expect(HTTPMethod.delete.sfSymbol == "trash.fill")
        #expect(HTTPMethod.patch.sfSymbol == "pencil.circle.fill")
        #expect(HTTPMethod.options.sfSymbol == "ellipsis.circle.fill")
        #expect(HTTPMethod.head.sfSymbol == "eye.circle.fill")
    }

    @Test("rawValue — GET/POST/PUT/DELETE/PATCH/OPTIONS/HEAD")
    func rawValues() {
        #expect(HTTPMethod.get.rawValue == "GET")
        #expect(HTTPMethod.post.rawValue == "POST")
        #expect(HTTPMethod.put.rawValue == "PUT")
        #expect(HTTPMethod.delete.rawValue == "DELETE")
        #expect(HTTPMethod.patch.rawValue == "PATCH")
        #expect(HTTPMethod.options.rawValue == "OPTIONS")
        #expect(HTTPMethod.head.rawValue == "HEAD")
    }

    @Test("Codable round-trip")
    func codableRoundTrip() throws {
        for method in HTTPMethod.allCases {
            let data = try JSONEncoder().encode(method)
            let decoded = try JSONDecoder().decode(HTTPMethod.self, from: data)
            #expect(decoded == method)
        }
    }
}

@Suite("HTTPResponse Tests")
struct HTTPResponseTests {
    @Test("isSuccess — 200 is success")
    func successStatus200() {
        let res = HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 10)
        #expect(res.isSuccess == true)
    }

    @Test("isSuccess — 201 is success")
    func successStatus201() {
        let res = HTTPResponse(statusCode: 201, headers: [:], body: Data(), durationMs: 10)
        #expect(res.isSuccess == true)
    }

    @Test("isSuccess — 299 is success")
    func successStatus299() {
        let res = HTTPResponse(statusCode: 299, headers: [:], body: Data(), durationMs: 10)
        #expect(res.isSuccess == true)
    }

    @Test("isSuccess — 300 is not success")
    func notSuccessStatus300() {
        let res = HTTPResponse(statusCode: 300, headers: [:], body: Data(), durationMs: 10)
        #expect(res.isSuccess == false)
    }

    @Test("isSuccess — 400 is not success")
    func notSuccessStatus400() {
        let res = HTTPResponse(statusCode: 400, headers: [:], body: Data(), durationMs: 10)
        #expect(res.isSuccess == false)
    }

    @Test("isSuccess — 500 is not success")
    func notSuccessStatus500() {
        let res = HTTPResponse(statusCode: 500, headers: [:], body: Data(), durationMs: 10)
        #expect(res.isSuccess == false)
    }

    @Test("bodyString — valid UTF-8 data returns string")
    func bodyStringValidUTF8() {
        let res = HTTPResponse(statusCode: 200, headers: [:],
                               body: Data("{\"ok\":true}".utf8), durationMs: 10)
        #expect(res.bodyString == "{\"ok\":true}")
    }

    @Test("bodyString — empty data returns empty string")
    func bodyStringEmpty() {
        let res = HTTPResponse(statusCode: 200, headers: [:], body: Data(), durationMs: 10)
        #expect(res.bodyString == "")
    }

    @Test("bodyString — non-UTF-8 data returns nil")
    func bodyStringNonUTF8() {
        let invalidUTF8 = Data([0xFF, 0xFE])
        let res = HTTPResponse(statusCode: 200, headers: [:], body: invalidUTF8, durationMs: 10)
        #expect(res.bodyString == nil)
    }

    @Test("durationMs stored correctly")
    func durationMsStoredCorrectly() {
        let res = HTTPResponse(statusCode: 200, headers: ["X-Custom": "val"],
                               body: Data("hello".utf8), durationMs: 42)
        #expect(res.durationMs == 42)
        #expect(res.headers["X-Custom"] == "val")
    }
}

@Suite("SwaggerManError Tests")
struct SwaggerManErrorTests {
    @Test("NetworkError.offline description")
    func networkOffline() {
        let err = SwaggerManError.network(.offline)
        #expect(err.errorDescription == "오프라인 상태입니다.")
    }

    @Test("NetworkError.timeout description")
    func networkTimeout() {
        let err = SwaggerManError.network(.timeout)
        #expect(err.errorDescription == "요청 시간이 초과되었습니다.")
    }

    @Test("NetworkError.dnsFailure description")
    func networkDNSFailure() {
        let err = SwaggerManError.network(.dnsFailure(host: "example.com"))
        #expect(err.errorDescription?.contains("example.com") == true)
    }

    @Test("NetworkError.tlsFailure description")
    func networkTLSFailure() {
        let err = SwaggerManError.network(.tlsFailure(detail: "cert expired"))
        #expect(err.errorDescription?.contains("cert expired") == true)
    }

    @Test("NetworkError.unauthorizedSwagger description")
    func networkUnauthorizedSwagger() {
        let err = SwaggerManError.network(.unauthorizedSwagger)
        #expect(err.errorDescription?.contains("인증") == true)
    }

    @Test("NetworkError.unexpectedStatus description")
    func networkUnexpectedStatus() {
        let err = SwaggerManError.network(.unexpectedStatus(503, body: ""))
        #expect(err.errorDescription?.contains("503") == true)
    }

    @Test("ParsingError.invalidJSON description")
    func parsingInvalidJSON() {
        let err = SwaggerManError.parsing(.invalidJSON("bad json"))
        #expect(err.errorDescription?.contains("bad json") == true)
    }

    @Test("ParsingError.invalidYAML description")
    func parsingInvalidYAML() {
        let err = SwaggerManError.parsing(.invalidYAML("bad yaml"))
        #expect(err.errorDescription?.contains("bad yaml") == true)
    }

    @Test("ParsingError.unsupportedVersion description")
    func parsingUnsupportedVersion() {
        let err = SwaggerManError.parsing(.unsupportedVersion("1.0"))
        #expect(err.errorDescription?.contains("1.0") == true)
    }

    @Test("ParsingError.missingField description")
    func parsingMissingField() {
        let err = SwaggerManError.parsing(.missingField("info"))
        #expect(err.errorDescription?.contains("info") == true)
    }

    @Test("AuthError.tokenNotSet description")
    func authTokenNotSet() {
        let err = SwaggerManError.auth(.tokenNotSet)
        #expect(err.errorDescription?.isEmpty == false)
    }

    @Test("AuthError.keychainDenied description")
    func authKeychainDenied() {
        let err = SwaggerManError.auth(.keychainDenied)
        #expect(err.errorDescription?.isEmpty == false)
    }

    @Test("AuthError.tokenExpired description")
    func authTokenExpired() {
        let err = SwaggerManError.auth(.tokenExpired)
        #expect(err.errorDescription?.isEmpty == false)
    }

    @Test("PersistenceError.saveFailed description")
    func persistenceSaveFailed() {
        let err = SwaggerManError.persistence(.saveFailed("disk full"))
        #expect(err.errorDescription?.contains("disk full") == true)
    }

    @Test("PersistenceError.duplicateAlias description")
    func persistenceDuplicateAlias() {
        let err = SwaggerManError.persistence(.duplicateAlias("MyAPI"))
        #expect(err.errorDescription?.contains("MyAPI") == true)
    }

    @Test("ValidationError.requiredFieldMissing description")
    func validationRequiredField() {
        let err = SwaggerManError.validation(.requiredFieldMissing("URL"))
        #expect(err.errorDescription?.contains("URL") == true)
    }

    @Test("ValidationError.typeMismatch description")
    func validationTypeMismatch() {
        let err = SwaggerManError.validation(.typeMismatch(field: "age", expected: "Int"))
        #expect(err.errorDescription?.contains("age") == true)
        #expect(err.errorDescription?.contains("Int") == true)
    }

    @Test("ValidationError.invalidJSON description")
    func validationInvalidJSON() {
        let err = SwaggerManError.validation(.invalidJSON(position: "line 3"))
        #expect(err.errorDescription?.contains("line 3") == true)
    }

    @Test("error is LocalizedError")
    func isLocalizedError() {
        let err: Error = SwaggerManError.network(.timeout)
        let localized = err as? LocalizedError
        #expect(localized != nil)
        #expect(localized?.errorDescription != nil)
    }
}

@Suite("ParsedSchema Tests")
struct ParsedSchemaTests {
    @Test("ParsedSchema init with all fields")
    func parsedSchemaAllFields() {
        let schema = ParsedSchema(
            type: .object,
            properties: ["name": ParsedSchema(type: .string)],
            items: nil,
            enumValues: ["a", "b"],
            required: ["name"],
            defaultValue: "default",
            example: "example",
            description: "desc"
        )
        #expect(schema.type == .object)
        #expect(schema.properties?.keys.contains("name") == true)
        #expect(schema.enumValues == ["a", "b"])
        #expect(schema.required == ["name"])
        #expect(schema.defaultValue == "default")
        #expect(schema.example == "example")
        #expect(schema.description == "desc")
    }

    @Test("SchemaType raw values")
    func schemaTypeRawValues() {
        #expect(SchemaType.string.rawValue == "string")
        #expect(SchemaType.integer.rawValue == "integer")
        #expect(SchemaType.number.rawValue == "number")
        #expect(SchemaType.boolean.rawValue == "boolean")
        #expect(SchemaType.array.rawValue == "array")
        #expect(SchemaType.object.rawValue == "object")
        #expect(SchemaType.unknown.rawValue == "unknown")
    }

    @Test("ParameterLocation raw values")
    func parameterLocationRawValues() {
        #expect(ParameterLocation.path.rawValue == "path")
        #expect(ParameterLocation.query.rawValue == "query")
        #expect(ParameterLocation.header.rawValue == "header")
        #expect(ParameterLocation.cookie.rawValue == "cookie")
    }
}
