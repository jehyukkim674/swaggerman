# SwaggerMan

[![커피 사주기](https://img.shields.io/badge/☕_커피_사주기-카카오페이-FFCD00?style=for-the-badge)](https://qr.kakaopay.com/FcUzxPAhE)

> 후원 링크는 **모바일 전용**입니다. PC에서는 휴대폰 카메라로 아래 QR을 스캔하세요.
>
> <img src="docs/donation-qr.png" width="140" alt="카카오페이 송금 QR">

**macOS · Windows · Linux용 OpenAPI / Swagger 탐색기.** Tauri 2 + React + TypeScript.

OpenAPI 스펙을 불러와 엔드포인트를 탐색하고, 요청을 보내고, 응답을 검증하는 데스크톱 앱입니다. Mock 서버·프록시 녹화·플로우 빌더·AI 어시스턴트(로컬 `claude` CLI 사용, API 키 불필요) 등 개발·테스트 도구를 내장했습니다.

## 다운로드 · 사용법

- **설치본 내려받기**: [Releases](https://github.com/jehyukkim674/swaggerman/releases/latest) (macOS `.dmg` / Windows `.exe`)
- **사용 매뉴얼**: https://jehyukkim674.github.io/swaggerman/
- 앱은 새 버전이 나오면 자동 업데이트를 안내합니다.

> **macOS에서 "손상되어 열 수 없습니다"가 뜨면**(서명 미인증 앱) 터미널에서
> `xattr -dr com.apple.quarantine /Applications/SwaggerMan.app` 실행 후 다시 여세요.
> **Windows에서 SmartScreen 경고**가 뜨면 **추가 정보 → 실행**을 누르세요.

## 주요 기능

- OpenAPI 3.x / Swagger 2 로드(JSON·YAML, `$ref` 해석, 오프라인 캐시 폴백, 파일 가져오기)
- 요청 편집·전송(임의 호스트, CORS 우회) + 응답 표시·JSON 뷰어·스키마 검증
- 히스토리(검색·필터·비교) / 컬렉션(Postman 호환, 4개 포맷 내보내기) / 러너
- 환경·변수 치환 `{{}}` / 요청 체이닝 / 어서션 / 인증(Bearer·Basic·API Key·OAuth2)
- **Mock 서버** · **프록시 녹화**(브라우저 CDP 캡처) · **플로우 빌더** · **API 성능 추이** · **시간여행** · **가이드 문서 생성**
- **AI 어시스턴트** — 설명/진단/폼 채우기/채팅, "✦ API 설명"(로컬 `claude` CLI)
- 자동 업데이트 · 멀티윈도우 · 커맨드 팔레트(⌘K) · 전역 단축키 · 다크/라이트 테마

전체 변경 이력은 [`apps/desktop/CHANGELOG.md`](apps/desktop/CHANGELOG.md)를 참고하세요.

## 개발

활성 앱은 **`apps/desktop/`**(Tauri 크로스플랫폼)입니다. 개발·빌드·릴리스 방법은 [`apps/desktop/README.md`](apps/desktop/README.md)를 참고하세요.

```bash
cd apps/desktop
npm install
npm run tauri dev      # 개발 실행(핫리로드)
```

> 저장소 루트의 `SwaggerMan/`(SwiftUI) 코드베이스는 초기 macOS 네이티브 버전으로,
> 현재 배포는 위의 Tauri 앱으로 이어집니다.
