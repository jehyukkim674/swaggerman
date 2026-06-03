// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPersonas,
  savePersonas,
  defaultPersonas,
  statusKind,
  type Persona,
} from "./permission-matrix";

beforeEach(() => localStorage.clear());

describe("statusKind", () => {
  it("상태코드를 분류한다", () => {
    expect(statusKind(200)).toBe("success");
    expect(statusKind(201)).toBe("success");
    expect(statusKind(302)).toBe("redirect");
    expect(statusKind(401)).toBe("perm");
    expect(statusKind(403)).toBe("perm");
    expect(statusKind(404)).toBe("error");
    expect(statusKind(500)).toBe("error");
    expect(statusKind(0)).toBe("net");
  });
});

describe("defaultPersonas", () => {
  it("관리자/일반/게스트 3개를 만들고 게스트는 빈 토큰이다", () => {
    const ps = defaultPersonas();
    expect(ps).toHaveLength(3);
    expect(ps.map((p) => p.name)).toEqual(["관리자", "일반", "게스트"]);
    expect(ps[2].token).toBe("");
    // id는 서로 다름
    expect(new Set(ps.map((p) => p.id)).size).toBe(3);
  });
});

describe("loadPersonas / savePersonas", () => {
  it("저장 후 같은 specUrl로 복원한다", () => {
    const ps: Persona[] = [{ id: "a", name: "관리자", token: "TOK" }];
    savePersonas("https://api.test/s.json", ps);
    expect(loadPersonas("https://api.test/s.json")).toEqual(ps);
  });
  it("저장된 적 없으면 빈 배열", () => {
    expect(loadPersonas("https://none/s.json")).toEqual([]);
  });
});
