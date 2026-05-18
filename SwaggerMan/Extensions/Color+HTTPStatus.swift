import SwiftUI

extension Color {
    static func httpStatus(_ code: Int) -> Color {
        switch code {
        case 200 ..< 300: .green
        case 300 ..< 400: .yellow
        case 400 ..< 500: .orange
        default: .red
        }
    }
}
