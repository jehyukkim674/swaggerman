import os.log
import SwiftData
import SwiftUI

private let log = Logger(subsystem: "com.swaggerman", category: "App")

@main
struct SwaggerManApp: App {
    let container: ModelContainer

    init() {
        container = Self.makeContainer()
    }

    /// ModelContainer를 생성한다.
    /// 스키마 비호환·저장소 손상으로 초기화가 실패하면 저장소를 삭제 후 재생성하고,
    /// 그래도 실패하면 인메모리로 대체해 앱이 실행 즉시 죽지 않도록 한다.
    private static func makeContainer() -> ModelContainer {
        let config = ModelConfiguration()
        do {
            let container = try ModelContainer(for: schema, configurations: config)
            log.info("ModelContainer 초기화 성공 (\(config.url.lastPathComponent))")
            return container
        } catch {
            log.error("ModelContainer 초기화 실패 — 저장소 복구 시도: \(error.localizedDescription)")
            deleteStore(at: config.url)
            do {
                let container = try ModelContainer(for: schema, configurations: config)
                log.warning("저장소 재생성 성공 — 기존 로컬 데이터(프로젝트/히스토리)는 초기화되었습니다")
                return container
            } catch {
                log.fault("저장소 재생성 실패 — 인메모리로 대체 실행: \(error.localizedDescription)")
                if let memory = try? ModelContainer(
                    for: schema,
                    configurations: ModelConfiguration(isStoredInMemoryOnly: true)
                ) {
                    return memory
                }
                fatalError("SwiftData ModelContainer 초기화 완전 실패: \(error)")
            }
        }
    }

    private static let schema = Schema([
        Project.self,
        APIEnvironment.self,
        FavoriteOperation.self,
        RequestCollection.self,
        SavedRequest.self,
        HistoryItem.self
    ])

    /// SQLite 저장소 본체와 동반 파일(-wal, -shm)을 함께 삭제한다.
    private static func deleteStore(at url: URL) {
        let fileManager = FileManager.default
        for suffix in ["", "-wal", "-shm"] {
            let target = URL(fileURLWithPath: url.path + suffix)
            if fileManager.fileExists(atPath: target.path) {
                do {
                    try fileManager.removeItem(at: target)
                    log.info("손상 저장소 파일 삭제: \(target.lastPathComponent)")
                } catch {
                    log.error("저장소 파일 삭제 실패(\(target.lastPathComponent)): \(error.localizedDescription)")
                }
            }
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .modelContainer(container)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .defaultSize(width: 1200, height: 750)
        .commands {
            CommandGroup(after: .appInfo) {
                Divider()
                Button("프로젝트 관리...") {
                    NotificationCenter.default.post(name: .openProjectSettings, object: nil)
                }
                .keyboardShortcut(",", modifiers: .command)
                Divider()
            }
        }
    }
}

extension Notification.Name {
    static let openProjectSettings = Notification.Name("com.swaggerman.openProjectSettings")
}
