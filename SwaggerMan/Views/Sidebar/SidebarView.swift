import SwiftUI

struct SidebarView: View {
    @Bindable var operationStore: OperationStore
    let onSelectOperation: (ParsedOperation) -> Void

    var body: some View {
        VStack(spacing: 0) {
            SearchBarView(text: $operationStore.searchText)

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
                    List(operationStore.operationsByTag, id: \.tag) { group in
                        Section(group.tag) {
                            ForEach(group.operations) { op in
                                OperationRowView(operation: op)
                                    .contentShape(Rectangle())
                                    .onTapGesture { onSelectOperation(op) }
                            }
                        }
                    }
                    .listStyle(.sidebar)
                }
            }
        }
    }
}

// MARK: - Search Bar

private struct SearchBarView: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("검색...", text: $text)
                .textFieldStyle(.plain)
            if !text.isEmpty {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color(.textBackgroundColor).opacity(0.4))
        .cornerRadius(8)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
    }
}

// MARK: - Method Filter Pills

private struct MethodFilterView: View {
    @Binding var selectedMethods: Set<HTTPMethod>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 4) {
                ForEach(HTTPMethod.allCases, id: \.self) { method in
                    let selected = selectedMethods.contains(method)
                    Button(method.rawValue) {
                        if selected { selectedMethods.remove(method) }
                        else { selectedMethods.insert(method) }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                    .tint(methodColor(method))
                    .background(selected ? methodColor(method).opacity(0.15) : .clear)
                    .cornerRadius(4)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
        }
    }

    private func methodColor(_ method: HTTPMethod) -> Color {
        switch method {
        case .get: return .green
        case .post: return .blue
        case .put: return .orange
        case .delete: return .red
        case .patch: return .purple
        case .options, .head: return .gray
        }
    }
}

// MARK: - Operation Row

struct OperationRowView: View {
    let operation: ParsedOperation

    var body: some View {
        HStack(spacing: 6) {
            Text(operation.method.rawValue)
                .font(.system(.caption, design: .monospaced).bold())
                .foregroundStyle(methodColor)
                .frame(width: 52, alignment: .leading)

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
        }
        .padding(.vertical, 2)
    }

    private var methodColor: Color {
        switch operation.method {
        case .get: return .green
        case .post: return .blue
        case .put: return .orange
        case .delete: return .red
        case .patch: return .purple
        case .options, .head: return .gray
        }
    }
}
