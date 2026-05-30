// swiftlint:disable file_length
import SwiftUI

struct SidebarView: View {
    @Bindable var operationStore: OperationStore
    let selectedOperationID: String?
    let onSelectOperation: (ParsedOperation) -> Void

    // Favorites
    let favoriteStore: FavoriteStore
    let project: Project
    let onToggleFavorite: (ParsedOperation) -> Void

    // History
    let historyStore: HistoryStore
    let onSelectHistory: (HistoryItem) -> Void
    let onReplayHistory: (HistoryItem) -> Void
    let onDeleteHistory: (HistoryItem) -> Void
    let onClearHistory: () -> Void

    let onRefresh: () -> Void

    @State private var tab: SidebarTab = .api

    enum SidebarTab: Hashable { case api, history }

    var body: some View {
        VStack(spacing: 0) {
            // API / 히스토리 탭 스위처
            Picker("", selection: $tab) {
                Text("API").tag(SidebarTab.api)
                Text(historyStore.items.isEmpty ? "히스토리" : "히스토리 \(historyStore.items.count)")
                    .tag(SidebarTab.history)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, 8)
            .padding(.vertical, 6)

            Divider()

            if tab == .api {
                apiTab
            } else {
                historyTab
            }
        }
    }

    // MARK: - API 탭

    private var apiTab: some View {
        VStack(spacing: 0) {
            SearchBarView(text: $operationStore.searchText)

            if !operationStore.availableTags.isEmpty {
                TagFilterView(
                    tags: operationStore.availableTags,
                    selectedTag: $operationStore.selectedTag
                )
            }

            MethodFilterView(selectedMethods: $operationStore.selectedMethods)

            Divider()

            Group {
                if operationStore.isLoading {
                    ProgressView("로딩 중...")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let err = operationStore.loadError {
                    loadErrorView(err)
                } else if operationStore.operationsByTag.isEmpty {
                    ContentUnavailableView(
                        "API 없음",
                        systemImage: "doc.text.magnifyingglass",
                        description: Text("프로젝트를 선택하거나 검색어를 바꿔보세요.")
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    operationsList
                }
            }
        }
    }

    private func loadErrorView(_ err: Error) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.title2)
                .foregroundStyle(.orange)
            Text(err.localizedDescription)
                .font(.caption)
                .multilineTextAlignment(.center)
            Button {
                onRefresh()
            } label: {
                Label("다시 시도", systemImage: "arrow.clockwise")
                    .font(.caption.weight(.medium))
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var operationsList: some View {
        List {
            // ── Favorites section (only if non-empty) ──
            if !favoriteStore.favorites.isEmpty {
                Section {
                    ForEach(favoriteStore.favorites) { fav in
                        if let op = operationStore.operations.first(where: {
                            $0.method.rawValue == fav.method && $0.path == fav.path
                        }) {
                            operationRow(op, isFavorite: true)
                                .contextMenu {
                                    Button("즐겨찾기 제거", role: .destructive) { onToggleFavorite(op) }
                                }
                        }
                    }
                    .onMove { source, dest in favoriteStore.move(from: source, to: dest) }
                } header: {
                    Label("즐겨찾기", systemImage: "star.fill")
                        .foregroundStyle(.yellow)
                        .font(.caption.weight(.semibold))
                }
            }

            // ── Operations section ──
            ForEach(operationStore.operationsByTag, id: \.tag) { group in
                Section(group.tag) {
                    ForEach(group.operations) { op in
                        operationRow(
                            op,
                            isFavorite: favoriteStore.isFavorite(method: op.method.rawValue, path: op.path)
                        )
                        .contextMenu {
                            Button(
                                favoriteStore.isFavorite(method: op.method.rawValue, path: op.path)
                                    ? "즐겨찾기 제거" : "즐겨찾기 추가",
                                systemImage: "star"
                            ) { onToggleFavorite(op) }
                        }
                    }
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
    }

    /// 행 전체는 탭으로 선택, 별표 버튼은 독립적으로 동작(중첩 Button 금지).
    private func operationRow(_ op: ParsedOperation, isFavorite: Bool) -> some View {
        OperationRowView(
            operation: op,
            isSelected: op.id == selectedOperationID,
            isFavorite: isFavorite,
            onToggleFavorite: { onToggleFavorite(op) }
        )
        .contentShape(Rectangle())
        .onTapGesture { onSelectOperation(op) }
        .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
        .listRowBackground(Color.clear)
    }

    // MARK: - 히스토리 탭

    private var historyTab: some View {
        Group {
            if historyStore.items.isEmpty {
                ContentUnavailableView(
                    "히스토리 없음",
                    systemImage: "clock",
                    description: Text("요청을 보내면 여기에 기록됩니다.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VStack(spacing: 0) {
                    HStack {
                        Text("\(historyStore.items.count)개 요청")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Button(role: .destructive) {
                            onClearHistory()
                        } label: {
                            Label("전체 삭제", systemImage: "trash")
                                .font(.caption)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(.red.opacity(0.85))
                        .help("이 프로젝트의 히스토리를 모두 삭제합니다.")
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)

                    Divider()

                    List {
                        ForEach(historyStore.items.prefix(100)) { item in
                            HistoryRowView(
                                item: item,
                                onSelect: { onSelectHistory(item) },
                                onReplay: { onReplayHistory(item) },
                                onDelete: { onDeleteHistory(item) }
                            )
                            .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                            .listRowBackground(Color.clear)
                            .contextMenu {
                                Button("삭제", role: .destructive) { onDeleteHistory(item) }
                                Button("히스토리 전체 삭제", role: .destructive) { onClearHistory() }
                            }
                        }
                    }
                    .listStyle(.plain)
                    .scrollContentBackground(.hidden)
                }
            }
        }
    }
}

// MARK: - Search Bar

struct SearchBarView: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("검색...", text: $text)
                .textFieldStyle(.plain)
            Button {
                text = ""
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .opacity(text.isEmpty ? 0 : 1)
            .allowsHitTesting(!text.isEmpty)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color(.textBackgroundColor).opacity(0.4))
        .clipShape(.rect(cornerRadius: 8))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }
}

// MARK: - Tag Filter

struct TagFilterView: View {
    let tags: [String]
    @Binding var selectedTag: String?

    var body: some View {
        HStack(spacing: 6) {
            Text("Tag")
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 28, alignment: .leading)

            Menu {
                Button("All") { selectedTag = nil }
                Divider()
                ForEach(tags, id: \.self) { tag in
                    Button(tag) { selectedTag = tag }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(selectedTag ?? "All")
                        .font(.caption)
                        .lineLimit(1)
                    Spacer()
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color(.textBackgroundColor).opacity(0.4))
                .clipShape(.rect(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(
                            selectedTag != nil ? Color.accentColor.opacity(0.7) : Color(.separatorColor),
                            lineWidth: 1
                        )
                )
            }
            .menuStyle(.borderlessButton)
            .fixedSize(horizontal: false, vertical: true)

            if selectedTag != nil {
                Button {
                    selectedTag = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                        .font(.system(size: 13))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }
}

// MARK: - Method Filter Pills

struct MethodFilterView: View {
    @Binding var selectedMethods: Set<HTTPMethod>

    var body: some View {
        let filterMethods: [HTTPMethod] = [.get, .post, .put, .delete, .patch]
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(filterMethods, id: \.self) { method in
                    let selected = selectedMethods.contains(method)
                    HStack(spacing: 3) {
                        Image(systemName: method.sfSymbol)
                            .font(.system(size: 9).weight(selected ? .bold : .medium))
                        Text(method.rawValue)
                            .font(.system(.caption, design: .monospaced).weight(selected ? .bold : .medium))
                    }
                    .foregroundStyle(selected ? .white : method.swiftUIColor)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background(selected ? method.swiftUIColor : method.swiftUIColor.opacity(0.12))
                    .clipShape(.rect(cornerRadius: 5))
                    .onTapGesture {
                        if selected { selectedMethods.remove(method) } else { selectedMethods.insert(method) }
                    }
                    .help("Filter by \(method.rawValue)")
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
    }
}

// MARK: - Operation Row

struct OperationRowView: View {
    let operation: ParsedOperation
    var isSelected: Bool = false
    var isFavorite: Bool = false
    var onToggleFavorite: (() -> Void)?

    var body: some View {
        HStack(spacing: 6) {
            // 즐겨찾기 별: 왼쪽 고정, 항상 표시 (호버해도 사라지지 않음)
            if let onToggle = onToggleFavorite {
                Button(action: onToggle) {
                    Image(systemName: isFavorite ? "star.fill" : "star")
                        .font(.system(size: 11))
                        .foregroundStyle(isFavorite ? .yellow : Color.secondary.opacity(0.45))
                }
                .buttonStyle(.plain)
                .help(isFavorite ? "즐겨찾기 제거" : "즐겨찾기 추가")
            }

            HStack(spacing: 3) {
                Image(systemName: operation.method.sfSymbol)
                    .font(.system(size: 9).bold())
                Text(operation.method.rawValue)
                    .font(.system(.caption, design: .monospaced).bold())
            }
            .foregroundStyle(operation.method.swiftUIColor)
            .frame(width: 68, alignment: .leading)

            VStack(alignment: .leading, spacing: 1) {
                Text(operation.path)
                    .font(.system(.caption, design: .monospaced))
                    .lineLimit(1)
                if let summary = operation.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            isSelected
                ? operation.method.swiftUIColor.opacity(0.18)
                : Color.clear
        )
        .clipShape(.rect(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(
                    isSelected ? operation.method.swiftUIColor.opacity(0.5) : Color.clear,
                    lineWidth: 1
                )
        )
    }
}

// swiftlint:enable file_length
