# Lint & Static Analysis Setup Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** SwiftLint + SwiftFormat을 Homebrew 기반으로 도입하고, Xcode Build Phase 및 pre-commit hook에 통합하여 빌드 시 경고와 커밋 시 자동 포맷/차단을 구현한다. 기존 코드의 위반 사항을 사전 정리하고 `RequestPaneView.swift`를 책임 단위로 분리한다.

**Architecture:** Homebrew로 SwiftLint/SwiftFormat을 설치하고, `.swiftlint.yml`과 `.swiftformat` 규칙 파일을 루트에 둔다. `project.yml`에 Build Phase 스크립트를 추가하고, `scripts/install-hooks.sh`로 pre-commit hook을 설치한다. Swift 6 엄격 동시성 경고를 `project.yml`에 활성화한다.

**Tech Stack:** SwiftLint (Homebrew), SwiftFormat (Homebrew), xcodegen (project.yml), git hooks, Makefile

---

## 1. 툴 구성

### SwiftLint 규칙 (`.swiftlint.yml`)

```yaml
disabled_rules:
  - trailing_whitespace       # SwiftFormat이 처리

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

### SwiftFormat 규칙 (`.swiftformat`)

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

---

## 2. Swift 6 동시성 경고 (`project.yml`)

`settings.base`에 추가:

```yaml
settings:
  base:
    SWIFT_VERSION: "5.9"
    MACOSX_DEPLOYMENT_TARGET: "14.0"
    ENABLE_HARDENED_RUNTIME: YES
    SWIFT_STRICT_CONCURRENCY: complete
```

---

## 3. Xcode Build Phase (`project.yml`)

`SwaggerMan` 타겟에 postBuildScript 추가:

```yaml
targets:
  SwaggerMan:
    ...
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

- 위반 시 Xcode Issue Navigator에 경고/에러 직접 표시
- SwiftLint 미설치 시 warning만 출력, 빌드 차단 없음

---

## 4. Pre-commit Hook

### `scripts/install-hooks.sh`

```bash
#!/bin/bash
HOOKS_DIR=".git/hooks"
cp scripts/pre-commit "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
echo "✅ pre-commit hook installed"
```

### `scripts/pre-commit`

```bash
#!/bin/bash

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep "\.swift$" || true)

if [ -z "$STAGED" ]; then
  exit 0
fi

# SwiftFormat: staged .swift 파일 자동 포맷 후 재스테이징
if which swiftformat > /dev/null; then
  echo "$STAGED" | xargs swiftformat --config .swiftformat --quiet
  echo "$STAGED" | xargs git add
else
  echo "warning: SwiftFormat not installed. Run: brew install swiftformat"
fi

# SwiftLint: 위반 시 커밋 차단
if which swiftlint > /dev/null; then
  if ! swiftlint --config .swiftlint.yml --strict; then
    echo "❌ SwiftLint 위반 발견. 커밋이 차단됩니다."
    exit 1
  fi
else
  echo "warning: SwiftLint not installed. Run: brew install swiftlint"
fi
```

### `Makefile`

```makefile
.PHONY: setup lint format

setup:
	@bash scripts/install-hooks.sh
	@echo "✅ 개발 환경 설정 완료"
	@echo "   필요한 툴: brew install swiftlint swiftformat"

lint:
	swiftlint --config .swiftlint.yml

format:
	swiftformat SwaggerMan --config .swiftformat

generate:
	xcodegen generate
```

---

## 5. 기존 코드 정리

### 5-1. `RequestPaneView.swift` 분리 (655줄 → 3파일)

| 현재 | 분리 후 파일 | 내용 |
|------|------------|------|
| `RequestPaneView.swift` (전체) | `RequestPaneView.swift` | 최상위 뷰, 섹션 조립, `OperationHeaderView` |
| (내부 private struct) | `AuthTokenBar.swift` | `AuthTokenBar`, `AuthTokenRow`, `NativeSecureField` |
| (내부 private struct) | `RequestSections.swift` | `ParamsSectionContent`, `HeadersSectionContent`, `BodySectionContent`, `ParamInputRow`, `HeaderInputRow` |

### 5-2. Force unwrap/try 제거

현재 코드에서 `!` 사용 위치를 `guard let` / `if let`으로 교체.

### 5-3. 미사용 import 정리

각 파일에서 실제로 사용하지 않는 `import` 제거.

### 5-4. Swift 6 동시성 경고 처리

`SWIFT_STRICT_CONCURRENCY: complete` 활성화 후 발생하는 경고를 `@MainActor`, `Sendable` 어노테이션으로 수정.

---

## 6. 설치 가이드 (README 업데이트)

```markdown
## 개발 환경 설정

### 필수 툴 설치
\`\`\`bash
brew install swiftlint swiftformat xcodegen
\`\`\`

### 초기 설정
\`\`\`bash
make setup      # pre-commit hook 설치
make generate   # Xcode 프로젝트 재생성
\`\`\`

### 수동 실행
\`\`\`bash
make lint       # SwiftLint 검사
make format     # SwiftFormat 자동 포맷
\`\`\`
```

---

## 구현 순서

1. `.swiftlint.yml`, `.swiftformat` 규칙 파일 추가
2. `project.yml`에 Build Phase + Swift 6 설정 추가 → `xcodegen generate`
3. `scripts/` 디렉토리에 `install-hooks.sh`, `pre-commit` 추가
4. `Makefile` 추가
5. 기존 코드 위반 사항 일괄 수정 (`make format` + lint 위반 수동 수정)
6. `RequestPaneView.swift` 3개 파일로 분리
7. Swift 6 동시성 경고 수정
8. README 업데이트
9. 커밋
