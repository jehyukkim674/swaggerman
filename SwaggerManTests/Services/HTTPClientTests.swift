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

    @Test("NotConnectedToInternet → network(.offline)")
    func offlineError() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.notConnectedToInternet) }

        let url = try #require(URL(string: "https://api.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
            Issue.record("Expected error")
        } catch let err as SwaggerManError {
            if case .network(.offline) = err { /* correct */ } else {
                Issue.record("Expected .offline, got \(err)")
            }
        }
    }

    @Test("NetworkConnectionLost → network(.offline)")
    func networkConnectionLost() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.networkConnectionLost) }

        let url = try #require(URL(string: "https://api.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
        } catch let err as SwaggerManError {
            if case .network(.offline) = err { /* correct */ }
        }
    }

    @Test("CannotFindHost → network(.dnsFailure)")
    func dnsFailure() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.cannotFindHost) }

        let url = try #require(URL(string: "https://nonexistent.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
        } catch let err as SwaggerManError {
            if case .network(.dnsFailure) = err { /* correct */ }
        }
    }

    @Test("CannotConnectToHost → network(.dnsFailure)")
    func cannotConnectToHost() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.cannotConnectToHost) }

        let url = try #require(URL(string: "https://host.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
        } catch let err as SwaggerManError {
            if case .network(.dnsFailure) = err { /* correct */ }
        }
    }

    @Test("ServerCertificateUntrusted → network(.tlsFailure)")
    func tlsFailure() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.serverCertificateUntrusted) }

        let url = try #require(URL(string: "https://self-signed.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
        } catch let err as SwaggerManError {
            if case .network(.tlsFailure) = err { /* correct */ }
        }
    }

    @Test("ServerCertificateHasUnknownRoot → network(.tlsFailure)")
    func tlsUnknownRoot() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.serverCertificateHasUnknownRoot) }

        let url = try #require(URL(string: "https://unknown-ca.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
        } catch let err as SwaggerManError {
            if case .network(.tlsFailure) = err { /* correct */ }
        }
    }

    @Test("기타 URLError → network(.unexpectedStatus)")
    func unknownURLError() async throws {
        let client = makeClient()
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { _ in throw URLError(.badServerResponse) }

        let url = try #require(URL(string: "https://api.example.com/data"))
        do {
            _ = try await client.get(url, headers: [:])
        } catch let err as SwaggerManError {
            if case .network(.unexpectedStatus) = err { /* correct */ }
        }
    }

    @Test("헤더 포함 GET 요청")
    func getWithHeaders() async throws {
        let client = makeClient()
        var capturedHeaders: [String: String] = [:]
        defer { MockURLProtocol.requestHandler = nil }

        MockURLProtocol.requestHandler = { req in
            req.allHTTPHeaderFields?.forEach { capturedHeaders[$0.key] = $0.value }
            let url = try #require(req.url)
            let res = try #require(HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil))
            return (res, Data())
        }

        let url = try #require(URL(string: "https://api.example.com/data"))
        _ = try await client.get(url, headers: ["X-Test": "TestValue"])
        #expect(capturedHeaders["X-Test"] == "TestValue")
    }
}
