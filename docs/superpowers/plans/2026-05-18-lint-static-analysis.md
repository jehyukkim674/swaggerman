# Lint & Static Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SwiftLint + SwiftFormat을 Homebrew 기반으로 도입하고, Xcode Build Phase와 pre-commit hook에 통합하며, 기존 코드 위반을 정리하고 `RequestPaneView.swift`를 3개 파일로 분리한다.

**Architecture:** `.swiftlint.yml` + `.swiftformat` 규칙 파일을 루트에 추가. `project.yml`에 SwiftLint Build Phase와 `SWIFT_STRICT_CONCURRENCY: complete` 설정을 추가하고 xcodegen으로 재생성. `scripts/` 디렉토리에 pre-commit hook 스크립트와 설치 스크립트를 추가하고 `Makefile`로 통합. 기존 force unwrap 2곳 제거 후 `RequestPaneView.swift`를 `AuthTokenBar.swift` + `RequestSections.swift`로 분리.

**Tech Stack:** SwiftLint (Homebrew), SwiftFormat (Homebrew), xcodegen, git hooks, Makefile, Swift 5.9 / macOS 14+

---

## File Structure

**Create:**
- `.swiftlint.yml` — SwiftLint 규칙 설정
- `.swiftformat` — SwiftFormat 규칙 설정
- `Makefile` — setup / lint / format / generate 명령어
- `scripts/install-hooks.sh` — pre-commit hook 설치 스크립트
- `scripts/pre-commit` — pre-commit hook 본문
- `SwaggerMan/Views/Request/AuthTokenBar.swift` — `AuthTokenBar`, `AuthTokenRow`, `NativeSecureField`
- `SwaggerMan/Views/Request/RequestSections.swift` — `ParamsSectionContent`, `HeadersSectionContent`, `BodySectionContent`, `AuthSectionContent`, `ParamGroup`, `ParamInputRow`, `QueryParamInputRow`, `HeaderInputRow`

**Modify:**
- `project.yml` — Build Phase 추가, `SWIFT_STRICT_CONCURRENCY: complete` 추가
- `SwaggerMan/Views/Request/RequestPaneView.swift` — 분리된 코드 제거, 최상위 뷰 + `RequestSection` + `OperationHeaderView`만 유지
- `SwaggerMan/Stores/OperationStore.swift:187,205` — force unwrap 2곳 제거

---

## Task 1: 규칙 파일 추가 (`.swiftlint.yml`, `.swiftformat`)

**Files:**
- Create: `.swiftlint.yml`
- Create: `.swiftformat`

- [ ] **Step 1: `.swiftlint.yml` 생성**

```bash
cat > /path/to/repo/.swiftlint.yml << 'EOF'
```

프로젝트 루트(`/Users/82312411gimjaehyeog/Dev/swagger-man/`)에 `.swiftlint.yml` 파일 생성:

```yaml
disabled_rules:
  - trailing_whitespace

opt_in_rules:
  - force_unwrapping
  - force_try
  - force_cast
  - empty_count
  - explicit_init
  - closure_spacing
  - overridden_super_call
  - prohibited_super_call
  - vertical_parameter_alignment_on_call
  - unneeded_parentheses_in_closure_argument
  - redundant_nil_coalescing

analyzer_rules:
  - explicit_self
  - unused_import

line_length:
  warning: 120
  error: 200
  ignores_comments: true
  ignores_urls: true

type_body_length:
  warning: 300
  error: 500

file_length:
  warning: 400
  error: 600

function_body_length:
  warning: 60
  error: 100

cyclomatic_complexity:
  warning: 10
  error: 20

identifier_name:
  min_length: 2
  excluded:
    - id
    - op
    - os
    - es
    - ps
    - hs
    - v
    - x
    - y

excluded:
  - SwaggerMan.xcodeproj
  - SwaggerManTests/Mocks
```

- [ ] **Step 2: `.swiftformat` 생성**

프로젝트 루트에 `.swiftformat` 파일 생성:

```
--indent 4
--tabwidth 4
--swiftversion 5.9
--disable redundantSelf
--enable isEmpty
--enable sortImports
--enable trailingCommas
--trimwhitespace always
--wrapcollections before-first
--maxwidth 120
--importgrouping testable-bottom
```

- [ ] **Step 3: SwiftLint/SwiftFormat 설치 확인 및 첫 실행**

```bash
# 설치 (미설치 시)
brew install swiftlint swiftformat

# 버전 확인
swiftlint version   # 예: 0.57.x
swiftformat --version  # 예: 0.54.x

# 첫 lint 실행 (현재 위반 파악)
cd /Users/82312411gimjaehyeog/Dev/swagger-man
swiftlint --config .swiftlint.yml 2>&1 | tail -20
```

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add .swiftlint.yml .swiftformat
git commit -m "chore: SwiftLint + SwiftFormat 규칙 파일 추가"
```

---

## Task 2: `project.yml` 업데이트 (Build Phase + Swift 6 동시성)

**Files:**
- Modify: `project.yml`

- [ ] **Step 1: `project.yml`에 `SWIFT_STRICT_CONCURRENCY` 추가**

`project.yml`의 `settings.base` 섹션을 다음과 같이 수정:

```yaml
settings:
  base:
    SWIFT_VERSION: "5.9"
    MACOSX_DEPLOYMENT_TARGET: "14.0"
    ENABLE_HARDENED_RUNTIME: YES
    SWIFT_STRICT_CONCURRENCY: complete
```

- [ ] **Step 2: SwaggerMan 타겟에 `postBuildScripts` 추가**

`project.yml`의 `targets.SwaggerMan` 섹션에 `dependencies` 아래에 추가:

```yaml
    postBuildScripts:
      - name: SwiftLint
        script: |
          if which swiftlint > /dev/null; then
            swiftlint --config "${SRCROOT}/.swiftlint.yml"
          else
            echo "warning: SwiftLint not installed. Run: brew install swiftlint"
          fi
        basedOnDependencyAnalysis: false
```

- [ ] **Step 3: xcodegen으로 프로젝트 재생성**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
xcodegen generate
```

Expected: `Generating project SwaggerMan` 출력 후 완료

- [ ] **Step 4: 빌드 확인**

```bash
xcodebuild -scheme SwaggerMan -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED|warning: SwiftLint"
```

Expected: `BUILD SUCCEEDED` (SwiftLint 경고가 있을 수 있지만 에러 없음)

- [ ] **Step 5: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add project.yml SwaggerMan.xcodeproj/
git commit -m "chore: Xcode Build Phase SwiftLint 통합 + Swift 6 동시성 경고 활성화"
```

---

## Task 3: pre-commit Hook + Makefile 추가

**Files:**
- Create: `scripts/install-hooks.sh`
- Create: `scripts/pre-commit`
- Create: `Makefile`

- [ ] **Step 1: `scripts/` 디렉토리 생성 및 `install-hooks.sh` 작성**

```bash
mkdir -p /Users/82312411gimjaehyeog/Dev/swagger-man/scripts
```

`scripts/install-hooks.sh` 파일 생성:

```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

cp "$SCRIPT_DIR/pre-commit" "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ pre-commit hook installed"
```

- [ ] **Step 2: `scripts/pre-commit` 작성**

`scripts/pre-commit` 파일 생성:

```bash
#!/bin/bash

REPO_ROOT="$(git rev-parse --show-toplevel)"
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep "\.swift$" || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

# SwiftFormat: staged .swift 파일 자동 포맷 후 재스테이징
if which swiftformat > /dev/null; then
  echo "$STAGED" | xargs swiftformat --config "$REPO_ROOT/.swiftformat" --quiet
  echo "$STAGED" | xargs git add
else
  echo "warning: SwiftFormat not installed. Run: brew install swiftformat"
fi

# SwiftLint: 위반 시 커밋 차단
if which swiftlint > /dev/null; then
  if ! swiftlint --config "$REPO_ROOT/.swiftlint.yml" --strict; then
    echo "❌ SwiftLint 위반 발견. 커밋이 차단됩니다."
    exit 1
  fi
else
  echo "warning: SwiftLint not installed. Run: brew install swiftlint"
fi
```

- [ ] **Step 3: `Makefile` 작성**

프로젝트 루트에 `Makefile` 생성 (탭 들여쓰기 필수):

```makefile
.PHONY: setup lint analyze format generate

setup:
	@bash scripts/install-hooks.sh
	@echo "✅ 개발 환경 설정 완료"
	@echo "   필요한 툴: brew install swiftlint swiftformat xcodegen"

lint:
	swiftlint --config .swiftlint.yml

analyze:
	swiftlint analyze --config .swiftlint.yml --compiler-log-path compile_commands.json

format:
	swiftformat SwaggerMan SwaggerManTests --config .swiftformat

generate:
	xcodegen generate
```

> **Note:** `unused_import`, `explicit_self` 규칙은 `analyzer_rules`로 선언되어 있어 `make lint`가 아닌 `make analyze`를 실행해야 검출됨. `swiftlint analyze`는 빌드 로그(`compile_commands.json`)가 필요하므로 CI에서 사용하거나 필요 시 수동 실행.

- [ ] **Step 4: 실행 권한 부여 및 hook 설치 테스트**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
chmod +x scripts/install-hooks.sh scripts/pre-commit
make setup
```

Expected: `✅ pre-commit hook installed` + `✅ 개발 환경 설정 완료`

- [ ] **Step 5: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add Makefile scripts/
git commit -m "chore: Makefile + pre-commit hook (SwiftFormat 자동 포맷 + SwiftLint 차단) 추가"
```

---

## Task 4: 기존 코드 force unwrap 제거

현재 `OperationStore.swift`에 force unwrap `!` 2곳이 있음 (line 187, 205).

**Files:**
- Modify: `SwaggerMan/Stores/OperationStore.swift:183-200,201-216`

- [ ] **Step 1: `discoverSpec` 함수의 force unwrap 제거 (line 187)**

`SwaggerMan/Stores/OperationStore.swift`에서 다음 코드를 찾아:

```swift
var base = URLComponents(url: url, resolvingAgainstBaseURL: false)!
base.query = nil
let candidates = ["/v3/api-docs", "/openapi.json", "/api/schema/", "/api-docs", "/swagger.json"]
```

다음으로 교체:

```swift
guard var base = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
    throw SwaggerManError.parsing(.invalidJSON("URL 파싱 실패: \(url)"))
}
base.query = nil
let candidates = ["/v3/api-docs", "/openapi.json", "/api/schema/", "/api-docs", "/swagger.json"]
```

- [ ] **Step 2: `swaggerConfigSpecURL` 함수의 force unwrap 제거 (line 205)**

같은 파일에서 다음 코드를 찾아:

```swift
var base = URLComponents(url: url, resolvingAgainstBaseURL: false)!
base.path = "/swagger-ui/swagger-config"
```

다음으로 교체:

```swift
guard var base = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
base.path = "/swagger-ui/swagger-config"
```

- [ ] **Step 3: 빌드 확인**

```bash
xcodebuild -scheme SwaggerMan -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED"
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 4: 테스트 실행**

```bash
xcodebuild test -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "Test Suite|passed|failed|error:"
```

Expected: 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add SwaggerMan/Stores/OperationStore.swift
git commit -m "fix: OperationStore force unwrap 2곳 guard let으로 교체"
```

---

## Task 5: `RequestPaneView.swift` 분리 — `AuthTokenBar.swift`

현재 `RequestPaneView.swift` (655줄)에서 `AuthTokenBar`, `AuthTokenRow`, `NativeSecureField`를 별도 파일로 분리.

**Files:**
- Create: `SwaggerMan/Views/Request/AuthTokenBar.swift`
- Modify: `SwaggerMan/Views/Request/RequestPaneView.swift` (해당 struct 제거)

- [ ] **Step 1: `AuthTokenBar.swift` 파일 생성**

`SwaggerMan/Views/Request/AuthTokenBar.swift` 파일을 생성하고 다음 내용 작성:

```swift
import SwiftUI
import AppKit

struct AuthTokenBar: View {
    @Bindable var operationStore: OperationStore
    @State private var showValues = false

    var schemes: [ParsedSecurityScheme] { operationStore.securitySchemes }

    private func isAuthorized(_ scheme: ParsedSecurityScheme) -> Bool {
        !(operationStore.securityValues[scheme.name] ?? "").isEmpty
    }

    var authorizedCount: Int { schemes.filter { isAuthorized($0) }.count }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: authorizedCount > 0 ? "lock.fill" : "lock.open")
                    .font(.system(size: 11))
                    .foregroundStyle(authorizedCount > 0 ? .green : .secondary)
                Text("Authorization")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                if authorizedCount > 0 {
                    Text("\(authorizedCount)/\(schemes.count)")
                        .font(.caption2)
                        .foregroundStyle(.green)
                }
                Spacer()
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) { showValues.toggle() }
                } label: {
                    Image(systemName: showValues ? "chevron.up" : "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation(.easeInOut(duration: 0.15)) { showValues.toggle() }
            }

            if showValues {
                VStack(spacing: 6) {
                    ForEach(schemes) { scheme in
                        AuthTokenRow(
                            scheme: scheme,
                            value: Binding(
                                get: { operationStore.securityValues[scheme.name] ?? "" },
                                set: { v in
                                    if v.isEmpty {
                                        operationStore.securityValues.removeValue(forKey: scheme.name)
                                    } else {
                                        operationStore.securityValues[scheme.name] = v
                                    }
                                }
                            ),
                            isAuthorized: isAuthorized(scheme)
                        )
                    }
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }
        }
        .background(Color(.windowBackgroundColor).opacity(0.5))
    }
}

struct AuthTokenRow: View {
    let scheme: ParsedSecurityScheme
    @Binding var value: String
    let isAuthorized: Bool
    @State private var showToken = false

    var schemeShortLabel: String {
        switch scheme.kind {
        case .apiKey(let name, _): return name
        case .http(let s): return s.capitalized
        case .oauth2: return "OAuth2"
        case .unknown: return "Token"
        }
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isAuthorized ? "lock.fill" : "lock.open")
                .font(.system(size: 10))
                .foregroundStyle(isAuthorized ? .green : .secondary)
                .frame(width: 12)

            Text(scheme.name)
                .font(.system(.caption, design: .monospaced).weight(.medium))
                .lineLimit(1)
                .frame(minWidth: 80, maxWidth: 120, alignment: .leading)

            Text(schemeShortLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background(Color.secondary.opacity(0.15))
                .clipShape(.rect(cornerRadius: 3))

            if showToken {
                TextField("토큰", text: $value)
                    .textFieldStyle(.roundedBorder)
                    .font(.system(.caption, design: .monospaced))
            } else {
                NativeSecureField(placeholder: "토큰", text: $value)
                    .frame(height: 22)
            }

            Button {
                showToken.toggle()
            } label: {
                Image(systemName: showToken ? "eye.slash" : "eye")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
        }
    }
}

struct NativeSecureField: NSViewRepresentable {
    var placeholder: String
    @Binding var text: String

    func makeNSView(context: Context) -> NSSecureTextField {
        let field = NSSecureTextField()
        field.placeholderString = placeholder
        field.delegate = context.coordinator
        field.isBordered = true
        field.bezelStyle = .roundedBezel
        field.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        field.focusRingType = .default
        return field
    }

    func updateNSView(_ nsView: NSSecureTextField, context: Context) {
        if nsView.stringValue != text {
            nsView.stringValue = text
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(text: $text) }

    final class Coordinator: NSObject, NSTextFieldDelegate {
        var text: Binding<String>
        init(text: Binding<String>) { self.text = text }

        func controlTextDidChange(_ obj: Notification) {
            guard let field = obj.object as? NSSecureTextField else { return }
            text.wrappedValue = field.stringValue
        }

        func controlTextDidEndEditing(_ obj: Notification) {
            guard let field = obj.object as? NSSecureTextField else { return }
            text.wrappedValue = field.stringValue
        }
    }
}
```

- [ ] **Step 2: `RequestPaneView.swift`에서 분리된 코드 삭제**

`RequestPaneView.swift`에서 `// MARK: - Inline Auth Token Bar` 주석부터 파일 끝까지 (`AuthTokenBar`, `AuthTokenRow`, `NativeSecureField` struct 3개) 전부 삭제. 파일은 line 488 (`// MARK: - Inline Auth Token Bar` 이전)까지만 남김.

- [ ] **Step 3: 빌드 확인**

```bash
xcodebuild -scheme SwaggerMan -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED"
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add SwaggerMan/Views/Request/AuthTokenBar.swift SwaggerMan/Views/Request/RequestPaneView.swift
git commit -m "refactor: AuthTokenBar를 별도 파일로 분리"
```

---

## Task 6: `RequestPaneView.swift` 분리 — `RequestSections.swift`

`RequestPaneView.swift`에 남은 섹션 컴포넌트들을 `RequestSections.swift`로 분리.

**Files:**
- Create: `SwaggerMan/Views/Request/RequestSections.swift`
- Modify: `SwaggerMan/Views/Request/RequestPaneView.swift` (섹션 struct 제거)

- [ ] **Step 1: `RequestSections.swift` 파일 생성**

`SwaggerMan/Views/Request/RequestSections.swift` 파일 생성:

```swift
import SwiftUI

// MARK: - Params content

struct ParamsSectionContent: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !store.pathParams.isEmpty {
                ParamGroup(title: "Path") {
                    ForEach(store.pathParams.keys.sorted(), id: \.self) { key in
                        ParamInputRow(
                            label: "{\(key)}",
                            placeholder: "값 입력",
                            isRequired: true,
                            value: Binding(
                                get: { store.pathParams[key] ?? "" },
                                set: { store.pathParams[key] = $0 }
                            )
                        )
                    }
                }
            }
            if !store.queryParams.isEmpty {
                ParamGroup(title: "Query") {
                    ForEach($store.queryParams) { $param in
                        QueryParamInputRow(param: $param)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
    }
}

// MARK: - Headers content

struct HeadersSectionContent: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(spacing: 4) {
            ForEach(store.requestHeaders, id: \.id) { header in
                HeaderInputRow(
                    header: Binding(
                        get: { store.requestHeaders.first(where: { $0.id == header.id }) ?? header },
                        set: { new in
                            if let i = store.requestHeaders.firstIndex(where: { $0.id == header.id }) {
                                store.requestHeaders[i] = new
                            }
                        }
                    ),
                    onDelete: { store.requestHeaders.removeAll { $0.id == header.id } }
                )
            }

            HStack {
                Spacer()
                Button {
                    store.requestHeaders.append(RequestParam(key: "", value: "", enabled: true))
                } label: {
                    Label("헤더 추가", systemImage: "plus")
                        .font(.caption.weight(.medium))
                        .foregroundStyle(Color.accentColor)
                }
                .buttonStyle(.plain)
                .padding(.trailing, 4)
            }
            .padding(.horizontal, 12)
            .padding(.top, 2)
        }
        .padding(.horizontal, 12)
    }
}

// MARK: - Body content

struct BodySectionContent: View {
    @Bindable var store: RequestEditorStore

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("JSON")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Spacer()
                Button("포맷") { formatJSON() }
                    .controlSize(.small)
                    .buttonStyle(.bordered)
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 6)

            TextEditor(text: $store.bodyJSON)
                .font(.system(.caption, design: .monospaced))
                .frame(minHeight: 120)
                .padding(8)
                .background(Color(.textBackgroundColor).opacity(0.4))
                .clipShape(.rect(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(.separatorColor), lineWidth: 1)
                )
                .padding(.horizontal, 12)
        }
    }

    private func formatJSON() {
        guard let data = store.bodyJSON.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let pretty = try? JSONSerialization.data(withJSONObject: obj, options: .prettyPrinted),
              let str = String(data: pretty, encoding: .utf8) else { return }
        store.bodyJSON = str
    }
}

// MARK: - Auth content

struct AuthSectionContent: View {
    let environment: APIEnvironment?

    var body: some View {
        Group {
            if let env = environment {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) {
                        Text("방식")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(width: 60, alignment: .leading)
                        Text(env.authScheme.displayName)
                            .font(.caption)
                        Spacer()
                    }

                    switch env.authScheme {
                    case .none:
                        EmptyView()
                    case .bearer:
                        let token = env.bearerToken ?? ""
                        HStack(spacing: 8) {
                            Text("Token")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .leading)
                            if token.isEmpty {
                                Label("환경 설정에서 토큰을 입력하세요.", systemImage: "exclamationmark.triangle")
                                    .font(.caption)
                                    .foregroundStyle(.orange)
                            } else {
                                Text("Bearer •••" + String(token.suffix(6)))
                                    .font(.system(.caption, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                        }
                    case .basic:
                        HStack(spacing: 8) {
                            Text("User")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .leading)
                            Text(env.basicUsername ?? "없음")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    case .apiKey:
                        HStack(spacing: 8) {
                            Text(env.apiKeyHeaderName ?? "Key")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 60, alignment: .leading)
                            let val = env.apiKeyValue ?? ""
                            Text(val.isEmpty ? "없음" : "•••" + String(val.suffix(4)))
                                .font(.caption)
                                .foregroundStyle(val.isEmpty ? .orange : .secondary)
                        }
                    }
                }
                .padding(.horizontal, 12)
            } else {
                Text("활성 환경이 없습니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 12)
            }
        }
    }
}

// MARK: - Shared row components

struct ParamGroup<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(.tertiary)
                .padding(.leading, 2)
            content()
        }
    }
}

struct ParamInputRow: View {
    let label: String
    let placeholder: String
    var isRequired: Bool = false
    @Binding var value: String

    var body: some View {
        HStack(spacing: 8) {
            HStack(spacing: 2) {
                Text(label)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                if isRequired {
                    Text("*").font(.caption2).foregroundStyle(.red)
                }
            }
            .frame(width: 110, alignment: .leading)
            .lineLimit(1)

            TextField(placeholder, text: $value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color(.textBackgroundColor).opacity(0.5))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))
        }
    }
}

struct QueryParamInputRow: View {
    @Binding var param: RequestParam

    var body: some View {
        HStack(spacing: 8) {
            Toggle("", isOn: $param.enabled).labelsHidden().scaleEffect(0.8).frame(width: 24)
            Text(param.key)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(param.enabled ? .primary : .tertiary)
                .frame(width: 90, alignment: .leading)
                .lineLimit(1)
            TextField("값 입력", text: $param.value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .disabled(!param.enabled)
                .padding(.horizontal, 8).padding(.vertical, 5)
                .background(param.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))
        }
    }
}

struct HeaderInputRow: View {
    @Binding var header: RequestParam
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Toggle("", isOn: $header.enabled).labelsHidden().scaleEffect(0.8).frame(width: 24)

            if header.isFromSpec {
                HStack(spacing: 3) {
                    Text(header.key)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(header.enabled ? .primary : .tertiary)
                    if header.isRequired {
                        Text("*").font(.caption2).foregroundStyle(.red)
                    }
                    Image(systemName: "doc.text")
                        .font(.system(size: 9))
                        .foregroundStyle(.secondary.opacity(0.6))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 8).padding(.vertical, 6)
                .background(Color(.textBackgroundColor).opacity(0.2))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor).opacity(0.5), lineWidth: 1))
            } else {
                TextField("Header 이름", text: $header.key)
                    .font(.system(.caption, design: .monospaced))
                    .textFieldStyle(.plain)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .background(Color(.textBackgroundColor).opacity(0.5))
                    .clipShape(.rect(cornerRadius: 5))
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))
            }

            TextField("값", text: $header.value)
                .font(.system(.caption, design: .monospaced))
                .textFieldStyle(.plain)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 8).padding(.vertical, 6)
                .background(header.enabled
                    ? Color(.textBackgroundColor).opacity(0.5)
                    : Color(.textBackgroundColor).opacity(0.15))
                .clipShape(.rect(cornerRadius: 5))
                .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(.separatorColor), lineWidth: 1))

            Button(action: onDelete) {
                Image(systemName: "minus.circle.fill").foregroundStyle(.red.opacity(0.7))
            }
            .buttonStyle(.plain)
        }
    }
}
```

- [ ] **Step 2: `RequestPaneView.swift`에서 분리된 코드 삭제**

`RequestPaneView.swift`에서 다음 `// MARK:` 섹션과 그 struct들을 전부 삭제:
- `// MARK: - Params content` + `ParamsSectionContent`
- `// MARK: - Headers content` + `HeadersSectionContent`
- `// MARK: - Body content` + `BodySectionContent`
- `// MARK: - Auth content` + `AuthSectionContent`
- `// MARK: - Shared row components` + `ParamGroup`, `ParamInputRow`, `QueryParamInputRow`, `HeaderInputRow`
- `// MARK: - Operation Header` + `OperationHeaderView`

삭제 후 `RequestPaneView.swift`에는 다음만 남음:
- `import SwiftUI`
- `struct RequestPaneView: View` (최상위 뷰)
- `// MARK: - Collapsible Section` + `private struct RequestSection`

단, `OperationHeaderView`는 `RequestPaneView.swift`에서 `RequestSections.swift`로 이동 (private → internal 접근 수준 변경).

`RequestSections.swift`에 `OperationHeaderView`도 추가:

```swift
// MARK: - Operation Header

struct OperationHeaderView: View {
    let operation: ParsedOperation
    let isSending: Bool
    let onSend: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Text(operation.method.rawValue)
                .font(.system(.body, design: .monospaced).bold())
                .foregroundStyle(operation.method.swiftUIColor)
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(operation.method.swiftUIColor.opacity(0.12))
                .clipShape(.rect(cornerRadius: 4))

            Text(operation.path)
                .font(.system(.body, design: .monospaced))
                .lineLimit(1)
                .foregroundStyle(.primary)

            Spacer()

            Button {
                onSend()
            } label: {
                if isSending {
                    ProgressView().scaleEffect(0.7).frame(width: 40)
                } else {
                    Text("Send").frame(width: 40)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(isSending)
            .help("선택한 endpoint로 HTTP 요청을 보냅니다.")
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
```

- [ ] **Step 3: 빌드 확인**

```bash
xcodebuild -scheme SwaggerMan -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED"
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 4: 테스트 실행**

```bash
xcodebuild test -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "Test Suite|passed|failed"
```

Expected: 모든 테스트 통과

- [ ] **Step 5: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add SwaggerMan/Views/Request/RequestSections.swift SwaggerMan/Views/Request/RequestPaneView.swift
git commit -m "refactor: RequestPaneView 섹션 컴포넌트 RequestSections.swift로 분리"
```

---

## Task 7: SwiftFormat 일괄 적용 + SwiftLint 위반 수정

**Files:**
- Modify: 전체 `SwaggerMan/` 하위 `.swift` 파일들

- [ ] **Step 1: SwiftFormat 일괄 실행**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
make format
```

Expected: 포맷 변경 없거나 소량 공백/정렬 수정

- [ ] **Step 2: SwiftLint 전체 실행 및 위반 확인**

```bash
swiftlint --config .swiftlint.yml 2>&1 | grep -E "error:|warning:" | head -30
```

출력된 위반 항목을 확인하고 수동으로 수정. 주로 나올 수 있는 항목:
- `line_length` 위반: 긴 줄을 줄바꿈
- `type_body_length` 위반: Task 5, 6 분리로 이미 해결됨
- `closure_spacing`: `{ $0.id == id }` → `{ $0.id == id }` (이미 올바름)
- `explicit_self`: 클로저 내 `self.` 추가 (analyzer rule이라 `--analyze` 플래그 필요)

- [ ] **Step 3: 빌드 확인**

```bash
xcodebuild -scheme SwaggerMan -configuration Debug build 2>&1 | grep -E "error:|BUILD SUCCEEDED|BUILD FAILED"
```

Expected: `BUILD SUCCEEDED`

- [ ] **Step 4: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add -u
git commit -m "style: SwiftFormat 일괄 적용 + SwiftLint 위반 수정"
```

---

## Task 8: README 업데이트

**Files:**
- Modify: `README.md` (없으면 Create)

- [ ] **Step 1: README.md 개발 환경 섹션 추가 또는 업데이트**

`README.md`에 다음 섹션 추가:

```markdown
## 개발 환경 설정

### 필수 툴 설치
\```bash
brew install swiftlint swiftformat xcodegen
\```

### 초기 설정 (클론 후 1회)
\```bash
make setup      # pre-commit hook 설치
make generate   # Xcode 프로젝트 재생성 (project.yml 수정 후)
\```

### 수동 실행
\```bash
make lint       # SwiftLint 검사
make format     # SwiftFormat 자동 포맷
\```

### 커밋 시 자동 실행
- **SwiftFormat**: staged `.swift` 파일 자동 포맷 후 재스테이징
- **SwiftLint**: 위반 시 커밋 차단 (`make setup` 후 활성화)
```

- [ ] **Step 2: 커밋**

```bash
cd /Users/82312411gimjaehyeog/Dev/swagger-man
git add README.md
git commit -m "docs: 개발 환경 설정 가이드 (SwiftLint/SwiftFormat/make setup) 추가"
```

---

## 완료 확인

모든 태스크 완료 후:

```bash
# 전체 테스트
xcodebuild test -scheme SwaggerMan -destination 'platform=macOS' 2>&1 | grep -E "passed|failed"

# lint 클린 확인
swiftlint --config .swiftlint.yml 2>&1 | grep "error:" | wc -l
# Expected: 0

# pre-commit hook 동작 확인
echo "// test" >> SwaggerMan/App/SwaggerManApp.swift
git add SwaggerMan/App/SwaggerManApp.swift
git commit -m "test: hook 테스트" --dry-run
# Expected: SwiftLint 통과 메시지 (또는 위반 시 차단)
git checkout SwaggerMan/App/SwaggerManApp.swift
```
