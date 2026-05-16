import Testing
import Foundation
@testable import SwaggerMan

@Suite("SpecCache Tests", .serialized)
struct SpecCacheTests {

    func makeCache() -> SpecCache {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("SwaggerManCacheTests-\(UUID().uuidString)")
        return SpecCache(cacheDirectory: tempDir)
    }

    func makeDummySpec() -> ParsedSpec {
        ParsedSpec(
            info: SpecInfo(title: "Test", version: "1.0", description: nil),
            servers: ["https://api.test.com"],
            operations: [],
            securitySchemes: [],
            rawOperationCount: 0
        )
    }

    @Test("저장 후 로드 가능")
    func storeAndLoad() async {
        let cache = makeCache()
        let url = "https://api.example.com/docs"
        let entry = CachedEntry(spec: makeDummySpec(), etag: "abc123", cachedAt: Date())

        await cache.store(entry, for: url)
        let loaded = await cache.load(for: url)

        #expect(loaded != nil)
        #expect(loaded?.etag == "abc123")
        #expect(loaded?.spec.info.title == "Test")
    }

    @Test("미저장 URL 로드 시 nil 반환")
    func loadMissingReturnsNil() async {
        let cache = makeCache()
        let loaded = await cache.load(for: "https://not-cached.com/docs")
        #expect(loaded == nil)
    }

    @Test("invalidate 후 nil 반환")
    func invalidateRemovesEntry() async {
        let cache = makeCache()
        let url = "https://api.example.com/v2/docs"
        let entry = CachedEntry(spec: makeDummySpec(), etag: nil, cachedAt: Date())

        await cache.store(entry, for: url)
        await cache.invalidate(for: url)
        let loaded = await cache.load(for: url)

        #expect(loaded == nil)
    }

    @Test("clear 후 모든 항목 제거")
    func clearRemovesAll() async {
        let cache = makeCache()
        let spec = makeDummySpec()

        await cache.store(CachedEntry(spec: spec, etag: nil, cachedAt: Date()), for: "https://a.com")
        await cache.store(CachedEntry(spec: spec, etag: nil, cachedAt: Date()), for: "https://b.com")
        await cache.clear()

        #expect(await cache.load(for: "https://a.com") == nil)
        #expect(await cache.load(for: "https://b.com") == nil)
    }
}
