// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPersonas,
  savePersonas,
  defaultPersonas,
  statusKind,
  runMatrix,
  type Persona,
  type MatrixCell,
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

describe("runMatrix", () => {
  const personas: Persona[] = [
    { id: "admin", name: "관리자", token: "ADMIN_TOK" },
    { id: "guest", name: "게스트", token: "" },
  ];
  const opIds = ["GET /a", "GET /b"];

  it("모든 (op × persona) 조합에 runOne을 호출하고 결과를 매핑한다", async () => {
    const calls: Array<{ opId: string; token: string }> = [];
    const runOne = async (opId: string, token: string): Promise<MatrixCell> => {
      calls.push({ opId, token });
      // admin은 200, guest는 401
      const status = token ? 200 : 401;
      return { status, ok: status < 300, durationMs: 5 };
    };
    const result = await runMatrix(personas, opIds, runOne);
    expect(calls).toHaveLength(4); // 2 op × 2 persona
    expect(result["GET /a"]["admin"].status).toBe(200);
    expect(result["GET /a"]["guest"].status).toBe(401);
    expect(result["GET /b"]["admin"].ok).toBe(true);
  });

  it("runOne이 throw해도 해당 셀만 net 에러로 기록하고 계속한다", async () => {
    const runOne = async (opId: string): Promise<MatrixCell> => {
      if (opId === "GET /a") throw new Error("boom");
      return { status: 200, ok: true, durationMs: 1 };
    };
    const result = await runMatrix(personas, opIds, runOne);
    expect(result["GET /a"]["admin"].status).toBe(0);
    expect(result["GET /a"]["admin"].error).toContain("boom");
    expect(result["GET /b"]["admin"].status).toBe(200); // 나머지는 정상
  });

  it("진행 콜백이 완료 개수만큼 호출된다", async () => {
    const progress: number[] = [];
    const runOne = async (): Promise<MatrixCell> => ({ status: 200, ok: true, durationMs: 1 });
    await runMatrix(personas, opIds, runOne, (done, total) => progress.push(done) || expect(total).toBe(4));
    expect(progress).toEqual([1, 2, 3, 4]);
  });
});
