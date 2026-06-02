# SwaggerMan

[![커피 사주기](https://img.shields.io/badge/☕_커피_사주기-카카오페이-FFCD00?style=for-the-badge)](https://qr.kakaopay.com/FcUzxPAhE)

> 후원 링크는 **모바일 전용**입니다. PC에서는 휴대폰 카메라로 아래 QR을 스캔하세요.
>
> <img src="docs/donation-qr.png" width="140" alt="카카오페이 송금 QR">

macOS용 OpenAPI / Swagger 탐색기 앱.

## 개발 환경 설정

### 필수 툴 설치

```bash
brew install swiftlint swiftformat xcodegen
```

### 초기 설정 (클론 후 1회)

```bash
make setup      # pre-commit hook 설치
make generate   # Xcode 프로젝트 재생성 (project.yml 수정 후)
```

### 수동 실행

```bash
make lint       # SwiftLint 검사
make format     # SwiftFormat 자동 포맷
make analyze    # SwiftLint 정적 분석 (unused imports 등)
```

### 커밋 시 자동 실행

`make setup` 후 커밋할 때 자동으로:
- **SwiftFormat**: staged `.swift` 파일 자동 포맷 후 재스테이징
- **SwiftLint**: 위반 시 커밋 차단
