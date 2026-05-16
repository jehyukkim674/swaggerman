import SwiftUI

struct HeadersTab: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(spacing: 0) {
            List {
                ForEach($store.requestHeaders) { $header in
                    HStack(spacing: 6) {
                        Toggle("", isOn: $header.enabled)
                            .labelsHidden()
                            .frame(width: 20)
                        TextField("Header 이름", text: $header.key)
                            .frame(maxWidth: .infinity)
                        TextField("값", text: $header.value)
                            .frame(maxWidth: .infinity)
                        Button {
                            store.requestHeaders.removeAll { $0.id == header.id }
                        } label: {
                            Image(systemName: "minus.circle.fill")
                                .foregroundStyle(.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .listStyle(.plain)

            Divider()

            Button {
                store.requestHeaders.append(RequestParam(key: "", value: "", enabled: true))
            } label: {
                Label("헤더 추가", systemImage: "plus")
            }
            .padding(8)
        }
    }
}
