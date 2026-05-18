import Foundation
import Testing
@testable import SwaggerMan

@Suite("CurlBuilder Tests")
struct CurlBuilderTests {
    @Test("GET 요청 — 플래그 없음")
    func buildGet() throws {
        let url = try #require(URL(string: "https://api.example.com/users"))
        let request = HTTPRequest(method: .get, url: url, headers: [:])
        let curl = CurlBuilder.build(request)
        #expect(curl == "curl \\\n  https://api.example.com/users")
    }

    @Test("POST JSON 요청 — -X, -H, -d 포함")
    func buildPost() throws {
        let url = try #require(URL(string: "https://api.example.com/users"))
        let body = Data("{\"name\":\"John\"}".utf8)
        let request = HTTPRequest(method: .post, url: url,
                                  headers: ["Content-Type": "application/json"], body: body)
        let curl = CurlBuilder.build(request)
        #expect(curl.contains("-X POST"))
        #expect(curl.contains("-H \"Content-Type: application/json\""))
        #expect(curl.contains("-d '{\"name\":\"John\"}'"))
        #expect(curl.contains("https://api.example.com/users"))
    }

    @Test("Authorization 헤더 마스킹 — Bearer ***")
    func masksAuthWhenEnabled() throws {
        let url = try #require(URL(string: "https://api.example.com/me"))
        let request = HTTPRequest(method: .get, url: url,
                                  headers: ["Authorization": "Bearer secret-token-abc"])
        let masked = CurlBuilder.build(request, options: .init(maskAuthorization: true))
        #expect(masked.contains("Bearer ***"))
        #expect(!masked.contains("secret-token-abc"))
    }

    @Test("Authorization 헤더 마스킹 비활성화 — 실제 값 포함")
    func noMaskingWhenDisabled() throws {
        let url = try #require(URL(string: "https://api.example.com/me"))
        let request = HTTPRequest(method: .get, url: url,
                                  headers: ["Authorization": "Bearer secret-token-abc"])
        let unmasked = CurlBuilder.build(request, options: .init(maskAuthorization: false))
        #expect(unmasked.contains("Bearer secret-token-abc"))
    }

    @Test("insecure 옵션 — -k 플래그 포함")
    func insecureFlag() throws {
        let url = try #require(URL(string: "https://dev.internal/api"))
        let request = HTTPRequest(method: .get, url: url, headers: [:])
        let curl = CurlBuilder.build(request, options: .init(insecure: true))
        #expect(curl.contains("-k"))
    }

    @Test("헤더 알파벳순 정렬")
    func sortedHeaders() throws {
        let url = try #require(URL(string: "https://api.example.com/data"))
        let request = HTTPRequest(method: .get, url: url,
                                  headers: ["X-Custom": "val", "Accept": "application/json"])
        let curl = CurlBuilder.build(request)
        let acceptIdx = try #require(curl.range(of: "Accept")?.lowerBound)
        let customIdx = try #require(curl.range(of: "X-Custom")?.lowerBound)
        #expect(acceptIdx < customIdx)
    }
}
