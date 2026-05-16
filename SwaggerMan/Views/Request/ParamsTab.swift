import SwiftUI

struct ParamsTab: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        if store.pathParams.isEmpty && store.queryParams.isEmpty {
            ContentUnavailableView("파라미터 없음", systemImage: "slash.circle")
        } else {
            Form {
                if !store.pathParams.isEmpty {
                    Section("Path Parameters") {
                        ForEach(store.pathParams.keys.sorted(), id: \.self) { key in
                            HStack {
                                Text("{\(key)}")
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 130, alignment: .leading)
                                TextField("값 입력", text: Binding(
                                    get: { store.pathParams[key] ?? "" },
                                    set: { store.pathParams[key] = $0 }
                                ))
                            }
                        }
                    }
                }

                if !store.queryParams.isEmpty {
                    Section("Query Parameters") {
                        ForEach($store.queryParams) { $param in
                            HStack {
                                Toggle("", isOn: $param.enabled)
                                    .labelsHidden()
                                    .frame(width: 20)
                                Text(param.key)
                                    .font(.system(.body, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 110, alignment: .leading)
                                TextField("값 입력", text: $param.value)
                            }
                        }
                    }
                }
            }
            .formStyle(.grouped)
        }
    }
}
