import Foundation
import os.log

private let log = Logger(subsystem: "com.swaggerman", category: "SpecCache")

actor SpecCache: SpecCacheProtocol {
    private var memoryCache: [String: CachedEntry] = [:]
    private let cacheDirectory: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

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
              let envelope = try? decoder.decode(CacheEnvelope.self, from: data)
        else { return nil }
        let entry = CachedEntry(spec: envelope.spec, etag: envelope.etag, cachedAt: envelope.cachedAt)
        memoryCache[urlString] = entry
        return entry
    }

    func store(_ entry: CachedEntry, for urlString: String) {
        memoryCache[urlString] = entry
        let envelope = CacheEnvelope(spec: entry.spec, etag: entry.etag, cachedAt: entry.cachedAt)
        let file = cacheFile(for: urlString)
        if let data = try? encoder.encode(envelope) {
            try? data.write(to: file, options: .atomic)
            log.debug("Spec cached to disk: \(file.lastPathComponent) (\(data.count) bytes)")
        }
    }

    func invalidate(for urlString: String) {
        memoryCache.removeValue(forKey: urlString)
        try? FileManager.default.removeItem(at: cacheFile(for: urlString))
    }

    func clear() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    private func cacheFile(for urlString: String) -> URL {
        let bytes = Array(urlString.utf8)
        var hash = 5381
        for byte in bytes {
            hash = ((hash << 5) &+ hash) &+ Int(byte)
        }
        return cacheDirectory.appendingPathComponent("spec_\(abs(hash)).json")
    }
}

private struct CacheEnvelope: Codable {
    let spec: ParsedSpec
    let etag: String?
    let cachedAt: Date
}

extension URL {
    static var defaultSpecCacheDirectory: URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("SwaggerMan")
    }
}
