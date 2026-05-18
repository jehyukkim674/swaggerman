import AppKit
import SwiftUI
import Testing
@testable import SwaggerMan

@Suite("View Body RequestSections Tests", .serialized)
@MainActor
struct ViewBodyRequestSectionTests {
    // MARK: - ParamGroup (from RequestSections.swift)

    @Test("ParamGroup body 실행")
    func paramGroupBody() {
        _ = ParamGroup(title: "Path") {
            Text("param content")
        }.body
    }

    @Test("ParamGroup with multiple children body 실행")
    func paramGroupMultipleChildren() {
        _ = ParamGroup(title: "Query") {
            Text("first")
            Text("second")
        }.body
    }

    // MARK: - ParamInputRow (from RequestSections.swift)

    @Test("ParamInputRow — isRequired=false body 실행")
    func paramInputRowNotRequired() {
        var value = "test-value"
        _ = ParamInputRow(
            label: "q",
            placeholder: "값 입력",
            isRequired: false,
            value: Binding(get: { value }, set: { value = $0 })
        ).body
    }

    @Test("ParamInputRow — isRequired=true body 실행")
    func paramInputRowRequired() {
        var value = ""
        _ = ParamInputRow(
            label: "{id}",
            placeholder: "값 입력",
            isRequired: true,
            value: Binding(get: { value }, set: { value = $0 })
        ).body
    }

    // MARK: - QueryParamInputRow (from RequestSections.swift)

    @Test("QueryParamInputRow — enabled=true body 실행")
    func queryParamInputRowEnabled() {
        var param = RequestParam(key: "filter", value: "active", enabled: true)
        _ = QueryParamInputRow(param: Binding(get: { param }, set: { param = $0 })).body
    }

    @Test("QueryParamInputRow — enabled=false body 실행")
    func queryParamInputRowDisabled() {
        var param = RequestParam(key: "filter", value: "inactive", enabled: false)
        _ = QueryParamInputRow(param: Binding(get: { param }, set: { param = $0 })).body
    }

    // MARK: - AuthSectionContent additional auth schemes (from RequestSections.swift)

    @Test("AuthSectionContent — basic 인증 body 실행")
    func authSectionContentBasic() {
        let env = APIEnvironment(name: "T", baseURL: "https://api.com")
        env.authScheme = .basic
        env.basicUsername = "admin"
        _ = AuthSectionContent(environment: env).body
    }

    @Test("AuthSectionContent — basic 인증 username nil body 실행")
    func authSectionContentBasicNoUsername() {
        let env = APIEnvironment(name: "T", baseURL: "https://api.com")
        env.authScheme = .basic
        env.basicUsername = nil
        _ = AuthSectionContent(environment: env).body
    }

    @Test("AuthSectionContent — apiKey with value body 실행")
    func authSectionContentAPIKeyWithValue() {
        let env = APIEnvironment(name: "T", baseURL: "https://api.com")
        env.authScheme = .apiKey
        env.apiKeyHeaderName = "X-Custom-Key"
        env.apiKeyValue = "my-secret-key"
        _ = AuthSectionContent(environment: env).body
    }

    @Test("AuthSectionContent — apiKey empty value body 실행")
    func authSectionContentAPIKeyEmptyValue() {
        let env = APIEnvironment(name: "T", baseURL: "https://api.com")
        env.authScheme = .apiKey
        env.apiKeyHeaderName = nil
        env.apiKeyValue = ""
        _ = AuthSectionContent(environment: env).body
    }

    // MARK: - HeadersSectionContent computed properties

    @Test("HeadersSectionContent.specHeaders and userHeaders 실행")
    func headersSectionContentComputedProperties() {
        let store = RequestEditorStore(httpClient: MockHTTPClient())
        store.requestHeaders = [
            RequestParam(key: "X-API-Key", value: "tok", enabled: true, isFromSpec: true, isRequired: true),
            RequestParam(key: "X-Custom", value: "val", enabled: true, isFromSpec: false)
        ]
        let view = HeadersSectionContent(store: store)
        _ = view.specHeaders
        _ = view.userHeaders
        _ = view.body
    }

    // MARK: - NativeSecureField Coordinator

    @Test("NativeSecureField.makeCoordinator and Coordinator init")
    func nativeSecureFieldMakeCoordinator() {
        var text = "secure-token"
        let field = NativeSecureField(
            placeholder: "토큰",
            text: Binding(get: { text }, set: { text = $0 })
        )
        let coordinator = field.makeCoordinator()
        #expect(coordinator.text.wrappedValue == "secure-token")
    }

    @Test("NativeSecureField.Coordinator.controlTextDidChange")
    func nativeSecureFieldControlTextDidChange() {
        var text = "initial"
        let coordinator = NativeSecureField.Coordinator(
            text: Binding(get: { text }, set: { text = $0 })
        )
        let nsField = NSSecureTextField()
        nsField.stringValue = "changed-value"
        let notification = Notification(
            name: NSTextField.textDidChangeNotification,
            object: nsField
        )
        coordinator.controlTextDidChange(notification)
        #expect(text == "changed-value")
    }

    @Test("NativeSecureField.Coordinator.controlTextDidEndEditing")
    func nativeSecureFieldControlTextDidEndEditing() {
        var text = "before"
        let coordinator = NativeSecureField.Coordinator(
            text: Binding(get: { text }, set: { text = $0 })
        )
        let nsField = NSSecureTextField()
        nsField.stringValue = "after-editing"
        let notification = Notification(
            name: NSTextField.textDidEndEditingNotification,
            object: nsField
        )
        coordinator.controlTextDidEndEditing(notification)
        #expect(text == "after-editing")
    }
}
