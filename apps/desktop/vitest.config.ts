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
  },
});
