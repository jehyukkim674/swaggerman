import Foundation

struct SpecInfo {
    let title: String
    let version: String
    let description: String?
}

enum SecuritySchemeKind {
    case apiKey(name: String, location: String) // name=header key, location=header/query/cookie
    case http(scheme: String) // scheme=bearer/basic
    case oauth2
    case unknown
}

struct ParsedSecurityScheme: Identifiable {
    let id: String // scheme name in spec (e.g. "systemTokenAuth")
    let name: String
    let kind: SecuritySchemeKind
    let description: String?
}

struct ParsedSpec {
    let info: SpecInfo
    let servers: [String]
    let operations: [ParsedOperation]
    let securitySchemes: [ParsedSecurityScheme]
    let rawOperationCount: Int
}
