// axquery.swift — SwaggerMan 포커스 창의 인터랙티브 UI 요소를 AX 트리에서 나열
// 매뉴얼 스크린샷 자동화용. 컴파일: swiftc -O -o axquery axquery.swift
// 출력: "role|라벨|x|y|w|h" 줄들 (논리 좌표, Accessibility 권한 필요)
// 사용법: axquery            : 버튼·입력란 등 인터랙티브 요소 전체
//        axquery <검색어>     : 라벨에 검색어가 포함된 요소만
import AppKit
import ApplicationServices
import Foundation

let searchTerm = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : nil

guard let app = NSWorkspace.shared.runningApplications
    .first(where: { $0.localizedName == "SwaggerMan" })
else {
    print("error: SwaggerMan 프로세스 없음")
    exit(1)
}

let axApp = AXUIElementCreateApplication(app.processIdentifier)

func attr(_ elem: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(elem, name as CFString, &value)
    return value
}

func point(of elem: AXUIElement) -> CGPoint {
    var pt = CGPoint.zero
    if let ref = attr(elem, kAXPositionAttribute), CFGetTypeID(ref) == AXValueGetTypeID() {
        // swiftlint:disable:next force_cast
        AXValueGetValue(ref as! AXValue, .cgPoint, &pt)
    }
    return pt
}

func size(of elem: AXUIElement) -> CGSize {
    var sz = CGSize.zero
    if let ref = attr(elem, kAXSizeAttribute), CFGetTypeID(ref) == AXValueGetTypeID() {
        // swiftlint:disable:next force_cast
        AXValueGetValue(ref as! AXValue, .cgSize, &sz)
    }
    return sz
}

let interestingRoles: Set<String> = [
    "AXButton", "AXTextField", "AXTextArea", "AXPopUpButton", "AXComboBox",
    "AXCheckBox", "AXRadioButton", "AXLink", "AXMenuButton", "AXTabGroup"
]

func label(of elem: AXUIElement) -> String {
    let candidates = [
        kAXTitleAttribute,
        kAXDescriptionAttribute,
        kAXValueAttribute,
        "AXPlaceholderValue",
        kAXHelpAttribute
    ]
    for key in candidates {
        if let val = attr(elem, key) as? String, !val.isEmpty {
            return val.replacingOccurrences(of: "\n", with: " ").prefix(60).description
        }
    }
    return ""
}

func walk(_ elem: AXUIElement, depth: Int) {
    if depth > 40 { return }
    let role = (attr(elem, kAXRoleAttribute) as? String) ?? "?"
    if interestingRoles.contains(role) {
        let lbl = label(of: elem)
        let pt = point(of: elem)
        let sz = size(of: elem)
        let line = "\(role)|\(lbl)|\(Int(pt.x))|\(Int(pt.y))|\(Int(sz.width))|\(Int(sz.height))"
        if let term = searchTerm {
            if lbl.localizedCaseInsensitiveContains(term) { print(line) }
        } else {
            print(line)
        }
    }
    if let children = attr(elem, kAXChildrenAttribute) as? [AXUIElement] {
        for child in children {
            walk(child, depth: depth + 1)
        }
    }
}

if let windowRef = attr(axApp, kAXFocusedWindowAttribute), CFGetTypeID(windowRef) == AXUIElementGetTypeID() {
    // swiftlint:disable:next force_cast
    walk(windowRef as! AXUIElement, depth: 0)
} else {
    print("error: 포커스된 창 없음")
    exit(1)
}
