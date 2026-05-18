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

    var body: some View {
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
                    VStack(spacing: 8) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.title2)
                            .foregroundStyle(.orange)
                        Text(err.localizedDescription)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if operationStore.operationsByTag.isEmpty {
                    ContentUnavailableView(
                        "API 없음",
                        systemImage: "doc.text.magnifyingglass",
                        description: Text("프로젝트를 선택하거나 검색어를 바꿔보세요.")
                    )
                } else {
                    List {
                        // ── Favorites section (only if non-empty) ──
                        if !favoriteStore.favorites.isEmpty {
                            Section {
                                ForEach(favoriteStore.favorites) { fav in
                                    if let op = operationStore.operations.first(where: {
                                        $0.method.rawValue == fav.method && $0.path == fav.path
                                    }) {
                                        Button { onSelectOperation(op) } label: {
                                            OperationRowView(
                                                operation: op,
                                                isSelected: op.id == selectedOperationID,
                                                isFavorite: true,
                                                onToggleFavorite: { onToggleFavorite(op) }
                                            )
                                        }
                                        .buttonStyle(.plain)
                                        .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
                                        .listRowBackground(Color.clear)
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
                                    Button { onSelectOperation(op) } label: {
                                        OperationRowView(
                                            operation: op,
                                            isSelected: op.id == selectedOperationID,
                                            isFavorite: favoriteStore.isFavorite(
                                                method: op.method.rawValue,
                                                path: op.path
                                            ),
                                            onToggleFavorite: { onToggleFavorite(op) }
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .listRowInsets(EdgeInsets(top: 2, leading: 8, bottom: 2, trailing: 8))
                                    .listRowBackground(Color.clear)
                                }
                            }
                        }

                        // ── History section (only if non-empty) ──
                        if !historyStore.items.isEmpty {
                            Section {
                                ForEach(historyStore.items.prefix(100)) { item in
                                    HistoryRowView(
                                        item: item,
                                        onSelect: { onSelectHistory(item) },
                                        onReplay: { onReplayHistory(item) }
                                    )
                                    .listRowInsets(EdgeInsets(top: 0, leading: 8, bottom: 0, trailing: 8))
                                    .listRowBackground(Color.clear)
                                    .contextMenu {
                                        Button("삭제", role: .destructive) { onDeleteHistory(item) }
                                        Button("히스토리 전체 삭제", role: .destructive) {
                                            onClearHistory()
                                        }
                                    }
                                }
                            } header: {
                                HStack {
                                    Label("히스토리", systemImage: "clock")
                                        .font(.caption.weight(.semibold))
                                    Spacer()
                                    Text("\(historyStore.items.count)")
                                        .font(.caption2)
                                        .foregroundStyle(.tertiary)
                                }
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

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 6) {
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

            if isHovered || isFavorite, let onToggle = onToggleFavorite {
                Button(action: onToggle) {
                    Image(systemName: isFavorite ? "star.fill" : "star")
                        .font(.system(size: 11))
                        .foregroundStyle(isFavorite ? .yellow : .secondary)
                }
                .buttonStyle(.plain)
                .help(isFavorite ? "즐겨찾기 제거" : "즐겨찾기 추가")
            }
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
        .onHover { isHovered = $0 }
    }
}

// MARK: - History Row

struct HistoryRowView: View {
    let item: HistoryItem
    let onSelect: () -> Void
    let onReplay: () -> Void

    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 6) {
            Text(item.method)
                .font(.system(.caption2, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(methodColor.opacity(0.12))
                .clipShape(.rect(cornerRadius: 3))

            VStack(alignment: .leading, spacing: 1) {
                Text(item.path)
                    .font(.system(.caption, design: .monospaced))
                    .lineLimit(1)
                Text(item.executedAt, style: .relative)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Text("\(item.responseStatus)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(statusColor)

            if isHovered {
                Button(action: onReplay) {
                    Image(systemName: "arrow.clockwise")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .help("요청 에디터에 불러오기 (응답 초기화)")
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 2)
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
    }

    private var methodColor: Color {
        HTTPMethod.color(for: item.method)
    }

    private var statusColor: Color {
        .httpStatus(item.responseStatus)
    }
}
