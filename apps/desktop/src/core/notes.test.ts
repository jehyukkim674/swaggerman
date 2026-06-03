// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  loadNotes,
  saveNotes,
  isEmptyNote,
  STATUS_META,
  emptyNote,
  type ApiNote,
  type NotesMap,
} from "./notes";

beforeEach(() => localStorage.clear());

describe("notes 영속화", () => {
  it("저장 후 같은 specUrl로 로드하면 동일 맵을 복원한다", () => {
    const notes: NotesMap = {
      "GET /pet/findByStatus": { text: "6월 제거 예정", status: "deprecated", updatedAt: 100 },
    };
    saveNotes("https://api.test/spec.json", notes);
    expect(loadNotes("https://api.test/spec.json")).toEqual(notes);
  });

  it("저장된 적 없는 specUrl은 빈 객체를 반환한다", () => {
    expect(loadNotes("https://none/spec.json")).toEqual({});
  });

  it("저장 시 빈 노트(text 공백 + status none)는 제거된다", () => {
    const notes: NotesMap = {
      "GET /a": { text: "  ", status: "none", updatedAt: 1 }, // 빈 노트
      "GET /b": { text: "남김", status: "none", updatedAt: 2 },
      "GET /c": { text: "", status: "review", updatedAt: 3 }, // status 있으면 유지
    };
    saveNotes("https://api.test/spec.json", notes);
    const loaded = loadNotes("https://api.test/spec.json");
    expect(loaded["GET /a"]).toBeUndefined();
    expect(loaded["GET /b"]).toBeDefined();
    expect(loaded["GET /c"]).toBeDefined();
  });
});

describe("isEmptyNote", () => {
  it("text가 공백이고 status가 none이면 빈 노트", () => {
    expect(isEmptyNote({ text: "   ", status: "none", updatedAt: 0 })).toBe(true);
  });
  it("text가 있으면 빈 노트 아님", () => {
    expect(isEmptyNote({ text: "x", status: "none", updatedAt: 0 })).toBe(false);
  });
  it("status가 none이 아니면 빈 노트 아님", () => {
    expect(isEmptyNote({ text: "", status: "stable", updatedAt: 0 })).toBe(false);
  });
});

describe("STATUS_META / emptyNote", () => {
  it("5개 상태 모두 라벨·색·점색을 갖는다", () => {
    for (const s of ["none", "deprecated", "review", "stable", "blocked"] as const) {
      expect(STATUS_META[s]).toBeDefined();
      expect(typeof STATUS_META[s].label).toBe("string");
    }
  });
  it("emptyNote는 빈 텍스트 + none 상태", () => {
    const n = emptyNote();
    expect(n.text).toBe("");
    expect(n.status).toBe("none");
  });
});
