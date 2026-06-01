import { describe, it, expect } from "vitest";
import { findActiveEnv } from "./env";

describe("findActiveEnv", () => {
  it("이름이 일치하는 환경을 우선 반환한다", () => {
    const envs = [
      { name: "개발기", baseURL: "https://dev.example.com" },
      { name: "운영기", baseURL: "https://prod.example.com" },
    ];
    expect(findActiveEnv(envs, "운영기", "https://dev.example.com")).toEqual({
      name: "운영기",
      baseURL: "https://prod.example.com",
    });
  });

  it("같은 baseURL 환경이 여러 개여도 이름으로 구분한다", () => {
    const envs = [
      { name: "개발기", baseURL: "X" },
      { name: "개발기2", baseURL: "X" },
    ];
    expect(findActiveEnv(envs, "개발기2", "X")).toEqual({
      name: "개발기2",
      baseURL: "X",
    });
  });

  it("이름 매칭 실패 시 baseURL로 폴백한다", () => {
    const envs = [
      { name: "개발기", baseURL: "https://dev.example.com" },
      { name: "운영기", baseURL: "https://prod.example.com" },
    ];
    expect(findActiveEnv(envs, "존재하지않음", "https://prod.example.com")).toEqual({
      name: "운영기",
      baseURL: "https://prod.example.com",
    });
  });

  it("이름이 빈 문자열이면 baseURL 매칭만 한다", () => {
    const envs = [
      { name: "개발기", baseURL: "X" },
      { name: "개발기2", baseURL: "X" },
    ];
    // 이름 미지정 → baseURL "X"의 첫 번째 환경
    expect(findActiveEnv(envs, "", "X")).toEqual({ name: "개발기", baseURL: "X" });
  });

  it("매칭되는 환경이 없으면 undefined를 반환한다", () => {
    const envs = [{ name: "개발기", baseURL: "X" }];
    expect(findActiveEnv(envs, "", "Y")).toBeUndefined();
  });
});
