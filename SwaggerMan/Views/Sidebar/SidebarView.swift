import SwiftUI

struct SidebarView: View {
    @Bindable var operationStore: OperationStore
    let selectedOperationID: String?
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
                                OperationRowView(
                                    operation: op,
                                    isSelected: op.id == selectedOperationID
                                )
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

// MARK: - Method Filter Pills

private struct MethodFilterView: View {
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
                        if selected { selectedMethods.remove(method) }
                        else { selectedMethods.insert(method) }
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
                    .foregroundStyle(isSelected ? .primary : .primary)
                    .lineLimit(1)
                if let summary = operation.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
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
    }
}
