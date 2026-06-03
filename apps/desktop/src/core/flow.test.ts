// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadFlows,
  saveFlows,
  addStep,
  removeStep,
  moveStep,
  runFlow,
  newFlow,
  type Flow,
  type ExecResult,
} from "./flow";

beforeEach(() => localStorage.clear());
const URL = "https://api.test/s.json";

function flowWith(steps: Flow["steps"]): Flow {
  return { id: "f1", name: "테스트", steps };
}

describe("flow CRUD", () => {
  it("addStep으로 단계 추가", () => {
    const f = addStep(newFlow("F"), "GET /a", "GET /a");
    expect(f.steps).toHaveLength(1);
    expect(f.steps[0].opId).toBe("GET /a");
  });

  it("removeStep으로 삭제", () => {
    let f = addStep(addStep(newFlow("F"), "GET /a", "a"), "GET /b", "b");
    f = removeStep(f, f.steps[0].id);
    expect(f.steps.map((s) => s.opId)).toEqual(["GET /b"]);
  });

  it("moveStep으로 순서 이동(0→1)", () => {
    let f = addStep(addStep(newFlow("F"), "GET /a", "a"), "GET /b", "b");
    f = moveStep(f, 0, 1);
    expect(f.steps.map((s) => s.opId)).toEqual(["GET /b", "GET /a"]);
  });

  it("저장/복원", () => {
    saveFlows(URL, [flowWith([])]);
    expect(loadFlows(URL)).toHaveLength(1);
  });
});

describe("runFlow", () => {
  it("단계를 순서대로 실행하고 추출 변수를 다음 단계로 전달한다", async () => {
    const f = flowWith([
      {
        id: "s1",
        opId: "POST /login",
        name: "login",
        extractRules: [{ varName: "token", path: "data.token" }],
        assertions: [],
      },
      {
        id: "s2",
        opId: "GET /me",
        name: "me",
        extractRules: [],
        assertions: [{ kind: "status", op: "equals", expected: "200" }],
      },
    ]);

    const calls: Array<{ opId: string; vars: Record<string, string> }> = [];
    const execOne = async (
      opId: string,
      vars: Record<string, string>,
    ): Promise<ExecResult> => {
      calls.push({ opId, vars: { ...vars } });
      if (opId === "POST /login")
        return { status: 200, ok: true, body: '{"data":{"token":"ABC"}}', durationMs: 5 };
      return { status: 200, ok: true, body: "{}", durationMs: 3 };
    };

    const { results, vars } = await runFlow(f, execOne, {});
    expect(calls[0].opId).toBe("POST /login");
    expect(calls[1].opId).toBe("GET /me");
    expect(calls[1].vars.token).toBe("ABC"); // 1단계 추출이 2단계로 전달
    expect(vars.token).toBe("ABC");
    expect(results[0].extracted.token).toBe("ABC");
    expect(results[1].assertResults[0].ok).toBe(true); // status 200 == 200
  });

  it("execOne이 status 0(오류)이어도 계속 실행하고 error 기록", async () => {
    const f = flowWith([
      { id: "s1", opId: "GET /a", name: "a", extractRules: [], assertions: [] },
      { id: "s2", opId: "GET /b", name: "b", extractRules: [], assertions: [] },
    ]);
    const execOne = async (opId: string): Promise<ExecResult> =>
      opId === "GET /a"
        ? { status: 0, ok: false, body: "", durationMs: 0, error: "네트워크" }
        : { status: 200, ok: true, body: "{}", durationMs: 1 };
    const { results } = await runFlow(f, execOne, {});
    expect(results[0].error).toBe("네트워크");
    expect(results[1].status).toBe(200); // 계속 실행
  });

  it("status 0(네트워크 오류) 단계는 assertions가 있어도 assertResults가 빈 배열", async () => {
    const f = flowWith([
      {
        id: "s1",
        opId: "GET /a",
        name: "a",
        extractRules: [],
        assertions: [{ kind: "status", op: "equals", expected: "200" }],
      },
    ]);
    const execOne = async (): Promise<ExecResult> => ({
      status: 0,
      ok: false,
      body: "",
      durationMs: 0,
      error: "네트워크 오류",
    });
    const { results } = await runFlow(f, execOne, {});
    expect(results[0].error).toBe("네트워크 오류");
    expect(results[0].assertResults).toEqual([]); // 어서션 skip
  });

  it("JSON 아닌 응답은 추출 skip(빈 extracted)", async () => {
    const f = flowWith([
      {
        id: "s1",
        opId: "GET /a",
        name: "a",
        extractRules: [{ varName: "x", path: "y" }],
        assertions: [],
      },
    ]);
    const execOne = async (): Promise<ExecResult> => ({
      status: 200,
      ok: true,
      body: "plain text",
      durationMs: 1,
    });
    const { results } = await runFlow(f, execOne, {});
    expect(results[0].extracted).toEqual({});
  });
});
