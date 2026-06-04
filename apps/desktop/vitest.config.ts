import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // 전역 환경은 node(순수 로직 테스트용). 컴포넌트 테스트는 파일 상단
    // `// @vitest-environment jsdom` 도크블록으로 파일별 jsdom을 사용한다.
    // globals: true는 React Testing Library의 자동 cleanup(afterEach)을 위해 필요.
    globals: true,
    // jsdom 29의 빈 localStorage를 인메모리 Storage 폴리필로 보강.
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        // 테스트 대상에서 제외하는 항목들:
        "src/**/*.test.{ts,tsx}",
        "src/test-setup.ts",
        // 앱 진입점/거대 오케스트레이터 — Tauri 런타임 통합 영역(단위 테스트 범위 밖)
        "src/main.tsx",
        "src/App.tsx",
        // 얇은 Tauri IO 래퍼(invoke 호출만 위임) — 통합 영역
        "src/core/fs.ts",
        "src/core/cookies.ts",
        "src/core/http-client.ts",
        "src/core/mock-client.ts",
        "src/core/proxy-client.ts",
        // 타입 전용/순수 프레젠테이션
        "src/core/types.ts",
        "src/components/icons.tsx",
        "src/vite-env.d.ts",
      ],
      reporter: ["text-summary", "text"],
      // 테스트 가능 단위(App.tsx·진입점·얇은 Tauri IO 래퍼 제외) 기준 커버리지 게이트.
      // 라인/구문은 90% 목표를 충족(회귀 방지용 게이트). 함수/분기는 Tauri 런타임·canvas
      // 렌더링·플랫폼 분기·방어적 fallback(??·catch) 등 단위 테스트로 실행 불가능한
      // 코드 비중 때문에 90% 도달이 비현실적 → 현재 달성치 기준의 회귀 방지 floor로 둔다.
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 85,
        branches: 78,
      },
    },
  },
});
