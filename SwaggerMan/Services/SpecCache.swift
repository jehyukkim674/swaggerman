import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "SpecCache")

// Codable wrapper for persistence
private struct CachedEnvelope: Codable {
    let infoTitle: String
    let infoVersion: String
    let infoDescription: String?
    let servers: [String]
    let etag: String?
    let cachedAt: Date
}

actor SpecCache: SpecCacheProtocol {
    private var memoryCache: [String: CachedEntry] = [:]
    private let cacheDirectory: URL

    init(cacheDirectory: URL = .defaultSpecCacheDirectory) {
        self.cacheDirectory = cacheDirectory
        do {
            try FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        } catch {
            log.error("캐시 디렉터리 생성 실패: \(error)")
        }
    }

    func load(for urlString: String) -> CachedEntry? {
        if let cached = memoryCache[urlString] { return cached }

        let file = cacheFile(for: urlString)
        guard let data = try? Data(contentsOf: file),
              let envelope = try? JSONDecoder().decode(CachedEnvelope.self, from: data) else {
            return nil
        }

        let spec = ParsedSpec(
            info: SpecInfo(title: envelope.infoTitle, version: envelope.infoVersion, description: envelope.infoDescription),
            servers: envelope.servers,
            operations: [],
            securitySchemes: [],
            rawOperationCount: 0
        )
        let entry = CachedEntry(spec: spec, etag: envelope.etag, cachedAt: envelope.cachedAt)
        memoryCache[urlString] = entry
        return entry
    }

    func store(_ entry: CachedEntry, for urlString: String) {
        memoryCache[urlString] = entry
        let envelope = CachedEnvelope(
            infoTitle: entry.spec.info.title,
            infoVersion: entry.spec.info.version,
            infoDescription: entry.spec.info.description,
            servers: entry.spec.servers,
            etag: entry.etag,
            cachedAt: entry.cachedAt
        )
        let file = cacheFile(for: urlString)
        if let data = try? JSONEncoder().encode(envelope) {
            try? data.write(to: file, options: .atomic)
        }
    }

    func invalidate(for urlString: String) {
        memoryCache.removeValue(forKey: urlString)
        try? FileManager.default.removeItem(at: cacheFile(for: urlString))
    }

    func clear() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(
            at: cacheDirectory,
            withIntermediateDirectories: true
        )
    }

    private func cacheFile(for urlString: String) -> URL {
        // Simple hash: use djb2 hash of URL UTF-8 bytes
        let bytes = Array(urlString.utf8)
        var hash = 5381
        for byte in bytes { hash = ((hash << 5) &+ hash) &+ Int(byte) }
        let filename = "spec_\(abs(hash)).json"
        return cacheDirectory.appendingPathComponent(filename)
    }
}

extension URL {
    static var defaultSpecCacheDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SwaggerMan")
    }
}
