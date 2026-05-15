import SwiftUI

struct ProjectListEditor: View {
    let store: ProjectStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack {
            Text("Project settings (coming in Task 13)")
            Button("닫기") { dismiss() }
        }
        .frame(width: 400, height: 200)
    }
}
