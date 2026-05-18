import Foundation
import Testing
@testable import SwaggerMan

@Suite("HTTPClient Tests", .serialized)
struct HTTPClientTests {
    func makeClient() -> HTTPClient {
        HTTPClient(session: .mock())
    }

    @Test("GET 요청 성공 시 200과 body 반환")
    func getSuccess() async throws {
        let client = makeClient()
        let body = Data(#"{"ok":true}"#.utf8)
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { req in
            #expect(req.httpMethod == "GET")
            let reqURL = try #require(req.url)
            let res = try #require(HTTPURLResponse(url: reqURL, statusCode: 200, httpVersion: nil, headerFields: nil))
            return (res, body)
        }

        let url = try #require(URL(string: "https://api.example.com/health"))
        let response = try await client.get(url, headers: [:])

        #expect(response.statusCode == 200)
        #expect(response.body == body)
    }

    @Test("POST 요청 시 body 전달됨")
    func postSendsBody() async throws {
        let client = makeClient()
        let requestBody = Data(#"{"name":"test"}"#.utf8)
        var capturedBody: Data?
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { req in
            capturedBody = req.httpBody
            let reqURL = try #require(req.url)
            let res = try #require(HTTPURLResponse(url: reqURL, statusCode: 201, httpVersion: nil, headerFields: nil))
            return (res, Data())
        }

        let url = try #require(URL(string: "https://api.example.com/users"))
        let req = HTTPRequest(
            method: .post,
            url: url,
            headers: ["Content-Type": "application/json"],
            body: requestBody
        )
        _ = try await client.execute(req)

        #expect(capturedBody == requestBody)
    }

    @Test("timeout 발생 시 SwaggerManError throw")
    func timeoutThrows() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in
            throw URLError(.timedOut)
        }

        let url = try #require(URL(string: "https://api.example.com/slow"))
        await #expect(throws: SwaggerManError.self) {
            _ = try await client.get(url, headers: [:])
        }
    }

    @Test("401 응답은 에러 없이 상태코드 그대로 반환")
    func unauthorizedPassedThrough() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { req in
            let reqURL = try #require(req.url)
            let res = try #require(HTTPURLResponse(url: reqURL, statusCode: 401, httpVersion: nil, headerFields: nil))
            return (res, Data())
        }

        let url = try #require(URL(string: "https://api.example.com/protected"))
        let response = try await client.get(url, headers: [:])

        #expect(response.statusCode == 401)
    }
}
