import Foundation

enum SwaggerManError: LocalizedError {
    case network(NetworkError)
    case parsing(ParsingError)
    case auth(AuthError)
    case persistence(PersistenceError)
    case validation(ValidationError)

    var errorDescription: String? {
        switch self {
        case .network(let e): return e.localizedDescription
        case .parsing(let e): return e.localizedDescription
        case .auth(let e): return e.localizedDescription
        case .persistence(let e): return e.localizedDescription
        case .validation(let e): return e.localizedDescription
        }
    }
}

enum NetworkError: LocalizedError {
    case offline
    case timeout
    case dnsFailure(host: String)
    case tlsFailure(detail: String)
    case unauthorizedSwagger
    case unexpectedStatus(Int, body: String)

    var errorDescription: String? {
        switch self {
        case .offline: return "오프라인 상태입니다."
        case .timeout: return "요청 시간이 초과되었습니다."
        case .dnsFailure(let host): return "호스트 '\(host)'에 연결할 수 없습니다."
        case .tlsFailure(let detail): return "TLS 검증 실패: \(detail)"
        case .unauthorizedSwagger: return "이 Swagger URL은 인증이 필요합니다."
        case .unexpectedStatus(let code, _): return "예상치 못한 응답 코드: \(code)"
        }
    }
}

enum ParsingError: LocalizedError {
    case invalidJSON(String)
    case invalidYAML(String)
    case unsupportedVersion(String)
    case missingField(String)

    var errorDescription: String? {
        switch self {
        case .invalidJSON(let msg): return "JSON 파싱 오류: \(msg)"
        case .invalidYAML(let msg): return "YAML 파싱 오류: \(msg)"
        case .unsupportedVersion(let v): return "지원하지 않는 OpenAPI 버전: \(v)"
        case .missingField(let field): return "필수 필드 누락: \(field)"
        }
    }
}

enum AuthError: LocalizedError {
    case tokenNotSet
    case keychainDenied
    case tokenExpired

    var errorDescription: String? {
        switch self {
        case .tokenNotSet: return "토큰이 설정되지 않았습니다."
        case .keychainDenied: return "Keychain 접근이 거부되었습니다."
        case .tokenExpired: return "토큰이 만료되었을 수 있습니다."
        }
    }
}

enum PersistenceError: LocalizedError {
    case saveFailed(String)
    case duplicateAlias(String)

    var errorDescription: String? {
        switch self {
        case .saveFailed(let msg): return "저장 실패: \(msg)"
        case .duplicateAlias(let alias): return "이미 사용 중인 alias입니다: '\(alias)'"
        }
    }
}

enum ValidationError: LocalizedError {
    case requiredFieldMissing(String)
    case typeMismatch(field: String, expected: String)
    case invalidJSON(position: String)

    var errorDescription: String? {
        switch self {
        case .requiredFieldMissing(let field): return "필수 항목을 입력하세요: \(field)"
        case .typeMismatch(let field, let expected): return "\(field) 필드는 \(expected) 타입이어야 합니다."
        case .invalidJSON(let pos): return "유효하지 않은 JSON (\(pos))"
        }
    }
}
