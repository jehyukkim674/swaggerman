import Foundation
import Testing
@testable import SwaggerMan

@Suite("SnippetBuilder Tests")
struct SnippetBuilderTests {
    // MARK: - Helpers

    private func makeURL(_ string: String) throws -> URL {
        try #require(URL(string: string))
    }

    // MARK: - Swift

    @Test("Swift GET — URLSession.shared.data(from:) 사용")
    func swiftGet() throws {
        let request = try HTTPRequest(
            method: .get,
            url: makeURL("https://api.example.com/users"),
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .swift)
        #expect(snippet.contains("URLSession.shared.data(from:"))
        #expect(snippet.contains("https://api.example.com/users"))
        #expect(!snippet.contains("httpMethod"))
    }

    @Test("Swift POST — httpMethod + httpBody 포함")
    func swiftPost() throws {
        let body = Data(#"{"name":"Alice"}"#.utf8)
        let request = try HTTPRequest(
            method: .post,
            url: makeURL("https://api.example.com/users"),
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let snippet = SnippetBuilder.build(request, language: .swift)
        #expect(snippet.contains("httpMethod = \"POST\""))
        #expect(snippet.contains("Content-Type"))
        #expect(snippet.contains("application/json"))
        #expect(snippet.contains(#"{"name":"Alice"}"#))
    }

    // MARK: - Python

    @Test("Python GET — import requests + get 함수")
    func pythonGet() throws {
        let request = try HTTPRequest(
            method: .get,
            url: makeURL("https://api.example.com/users"),
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .python)
        #expect(snippet.contains("import requests"))
        #expect(snippet.contains("requests.get"))
        #expect(snippet.contains("https://api.example.com/users"))
    }

    @Test("Python POST — data= 파라미터 포함")
    func pythonPost() throws {
        let body = Data(#"{"name":"Alice"}"#.utf8)
        let request = try HTTPRequest(
            method: .post,
            url: makeURL("https://api.example.com/users"),
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let snippet = SnippetBuilder.build(request, language: .python)
        #expect(snippet.contains("requests.post"))
        #expect(snippet.contains(#"{"name":"Alice"}"#))
    }

    @Test("Python DELETE — data= 없음")
    func pythonDelete() throws {
        let request = try HTTPRequest(
            method: .delete,
            url: makeURL("https://api.example.com/users/1"),
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .python)
        #expect(snippet.contains("requests.delete"))
        #expect(!snippet.contains("data="))
    }

    // MARK: - JavaScript

    @Test("JavaScript GET — fetch URL만 포함")
    func javascriptGet() throws {
        let request = try HTTPRequest(
            method: .get,
            url: makeURL("https://api.example.com/users"),
            headers: [:]
        )
        let snippet = SnippetBuilder.build(request, language: .javascript)
        #expect(snippet.contains("fetch("))
        #expect(snippet.contains("https://api.example.com/users"))
    }

    @Test("JavaScript POST — method + body 포함")
    func javascriptPost() throws {
        let body = Data(#"{"name":"Alice"}"#.utf8)
        let request = try HTTPRequest(
            method: .post,
            url: makeURL("https://api.example.com/users"),
            headers: ["Content-Type": "application/json"],
            body: body
        )
        let snippet = SnippetBuilder.build(request, language: .javascript)
        #expect(snippet.contains("method: \"POST\""))
        #expect(snippet.contains("Content-Type"))
        #expect(snippet.contains(#"{"name":"Alice"}"#))
    }
}
