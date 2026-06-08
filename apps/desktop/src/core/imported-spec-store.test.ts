// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  saveImportedSpec,
  loadImportedSpec,
  deleteImportedSpec,
  isFileProject,
  FILE_PROJECT_PREFIX,
} from "./imported-spec-store";

const rec = (over: Partial<Parameters<typeof saveImportedSpec>[0]> = {}) => ({
  url: `${FILE_PROJECT_PREFIX}abc`,
  fileName: "api.yaml",
  content: "openapi: 3.0.0",
  importedAt: 123,
  ...over,
});

describe("imported-spec-store", () => {
  it("저장 후 같은 키로 로드하면 레코드가 보존된다", async () => {
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}rt` }));
    const got = await loadImportedSpec(`${FILE_PROJECT_PREFIX}rt`);
    expect(got?.fileName).toBe("api.yaml");
    expect(got?.content).toBe("openapi: 3.0.0");
    expect(got?.importedAt).toBe(123);
  });

  it("같은 키 저장은 덮어쓴다", async () => {
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}ov`, content: "v1" }));
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}ov`, content: "v2" }));
    const got = await loadImportedSpec(`${FILE_PROJECT_PREFIX}ov`);
    expect(got?.content).toBe("v2");
  });

  it("없는 키는 null", async () => {
    expect(await loadImportedSpec(`${FILE_PROJECT_PREFIX}none`)).toBeNull();
  });

  it("삭제 후 로드하면 null", async () => {
    await saveImportedSpec(rec({ url: `${FILE_PROJECT_PREFIX}del` }));
    await deleteImportedSpec(`${FILE_PROJECT_PREFIX}del`);
    expect(await loadImportedSpec(`${FILE_PROJECT_PREFIX}del`)).toBeNull();
  });

  it("isFileProject는 접두사로 판별", () => {
    expect(isFileProject(`${FILE_PROJECT_PREFIX}x`)).toBe(true);
    expect(isFileProject("https://a.com/api-docs")).toBe(false);
  });

  it("저장 실패 시(직렬화 불가) reject 한다", async () => {
    const bad = {
      url: `${FILE_PROJECT_PREFIX}boom`,
      fileName: "x",
      content: (() => {}) as unknown as string, // 함수는 structured clone 불가 → put 거부
      importedAt: 1,
    };
    await expect(saveImportedSpec(bad)).rejects.toBeTruthy();
  });
});
