import SwiftUI

struct ParamsTab: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        if store.pathParams.isEmpty, store.queryParams.isEmpty {
            ContentUnavailableView("파라미터 없음", systemImage: "slash.circle")
        } else {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if !store.pathParams.isEmpty {
                        ParamSection(title: "Path Parameters") {
                            ForEach(store.pathParams.keys.sorted(), id: \.self) { key in
                                ParamsTabInputRow(
                                    label: "{\(key)}",
                                    placeholder: "값 입력",
                                    value: Binding(
                                        get: { store.pathParams[key] ?? "" },
                                        set: { store.pathParams[key] = $0 }
                                    )
                                )
                            }
                        }
                    }

                    if !store.queryParams.isEmpty {
                        ParamSection(title: "Query Parameters") {
                            ForEach($store.queryParams) { $param in
                                ParamsTabQueryInputRow(param: $param)
                            }
                        }
                    }
                }
                .padding(12)
            }
        }
    }
}

// MARK: - Section

private struct ParamSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.leading, 2)
            VStack(spacing: 4) {
                content()
            }
        }
    }
}

// MARK: - Path param row

private struct ParamsTabInputRow: View {
    let label: String
    let placeholder: String
    @Binding var value: String

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.secondary)
                .frame(width: 120, alignment: .leading)
                .lineLimit(1)

            TextField(placeholder, text: $value)
                .font(.system(.body, design: .monospaced))
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(Color(.textBackgroundColor).opacity(0.5))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(Color(.separatorColor), lineWidth: 1)
                )
        }
        .padding(.horizontal, 4)
    }
}

// MARK: - Query param row

private struct ParamsTabQueryInputRow: View {
    @Binding var param: RequestParam

    var body: some View {
        HStack(spacing: 8) {
            Toggle("", isOn: $param.enabled)
                .labelsHidden()
                .scaleEffect(0.85)
                .frame(width: 24)

            Text(param.key)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(param.enabled ? .primary : .tertiary)
                .frame(width: 110, alignment: .leading)
                .lineLimit(1)

            TextField("값 입력", text: $param.value)
                .font(.system(.body, design: .monospaced))
                .textFieldStyle(.plain)
                .disabled(!param.enabled)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(param.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(Color(.separatorColor), lineWidth: 1)
                )
        }
        .padding(.horizontal, 4)
    }
}
