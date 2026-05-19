import Foundation

struct SpecInfo: Codable {
    let title: String
    let version: String
    let description: String?
}

enum SecuritySchemeKind: Codable {
    case apiKey(name: String, location: String)
    case http(scheme: String)
    case oauth2
    case unknown

    private enum CodingKeys: String, CodingKey { case type, name, location, scheme }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(String.self, forKey: .type) {
        case "apiKey": self = try .apiKey(name: container.decode(String.self, forKey: .name),
                                          location: container.decode(String.self, forKey: .location))
        case "http": self = try .http(scheme: container.decode(String.self, forKey: .scheme))
        case "oauth2": self = .oauth2
        default: self = .unknown
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .apiKey(name, location):
            try container.encode("apiKey", forKey: .type); try container.encode(name, forKey: .name); try container
                .encode(
                    location,
                    forKey: .location
                )
        case let .http(scheme):
            try container.encode("http", forKey: .type); try container.encode(scheme, forKey: .scheme)
        case .oauth2: try container.encode("oauth2", forKey: .type)
        case .unknown: try container.encode("unknown", forKey: .type)
        }
    }
}

struct ParsedSecurityScheme: Identifiable, Codable {
    let id: String
    let name: String
    let kind: SecuritySchemeKind
    let description: String?
}

struct ParsedSpec: Codable {
    let info: SpecInfo
    let servers: [String]
    let operations: [ParsedOperation]
    let securitySchemes: [ParsedSecurityScheme]
    let rawOperationCount: Int
}
