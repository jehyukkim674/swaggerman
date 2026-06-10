// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const openMock = vi.fn();
const saveMock = vi.fn();
const readTextFileMock = vi.fn();
const writeTextFileMock = vi.fn();

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...a: unknown[]) => openMock(...a),
  save: (...a: unknown[]) => saveMock(...a),
}));
vi.mock("../core/fs", () => ({
  readTextFile: (...a: unknown[]) => readTextFileMock(...a),
  writeTextFile: (...a: unknown[]) => writeTextFileMock(...a),
}));

import { CollectionsModal } from "./CollectionsModal";
import type { Collection } from "../core/collections";

const COLLECTIONS: Collection[] = [
  {
    id: "c1",
    name: "내 컬렉션",
    requests: [
      { id: "r1", name: "유저 조회", method: "GET", url: "https://x/users", headers: [{ key: "X-Token", value: "t1" }], body: '{"q":1}', folder: "유저" },
    ],
  },
];

const CURRENT = {
  method: "POST",
  url: "https://x/users",
  headers: [{ key: "A", value: "1", enabled: true }],
  body: '{"a":1}',
};

function setup(over: Partial<Parameters<typeof CollectionsModal>[0]> = {}) {
  const props = {
    collections: COLLECTIONS,
    onChange: vi.fn(),
    current: null,
    onLoad: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  render(<CollectionsModal {...props} />);
  return props;
}

describe("CollectionsModal", () => {
  beforeEach(() => {
    openMock.mockReset();
    saveMock.mockReset();
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
  });

  it("컬렉션과 저장 요청을 렌더한다", () => {
    setup();
    expect(screen.getByText(/내 컬렉션/)).toBeTruthy();
    expect(screen.getByText("유저 조회")).toBeTruthy();
  });

  it("빈 목록이면 안내 힌트", () => {
    setup({ collections: [] });
    expect(screen.getByText(/컬렉션이 없습니다/)).toBeTruthy();
  });

  it("'+ 새 컬렉션'이 컬렉션을 추가", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByText("+ 새 컬렉션"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(onChange).mock.calls[0][0]).toHaveLength(2);
  });

  it("current가 없으면 저장 영역을 숨긴다", () => {
    setup({ current: null });
    expect(screen.queryByText("현재 요청 저장")).toBeNull();
  });

  it("current가 있으면 현재 요청을 기존 컬렉션에 저장", () => {
    const { onChange } = setup({ current: CURRENT });
    // placeholder는 URL 경로 기반 기본 이름
    fireEvent.change(screen.getByPlaceholderText("/users"), { target: { value: "새 요청" } });
    fireEvent.click(screen.getByText("현재 요청 저장"));
    const next = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    expect(next[0].requests).toHaveLength(2);
    expect(next[0].requests[1].name).toBe("새 요청");
  });

  it("이름을 비우고 저장하면 URL 경로가 기본 이름이 된다", () => {
    const { onChange } = setup({ current: CURRENT });
    fireEvent.click(screen.getByText("현재 요청 저장"));
    const next = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    expect(next[0].requests[1].name).toBe("/users");
  });

  it("새 컬렉션 대상으로 저장하면 컬렉션이 생성된다", () => {
    const { onChange } = setup({ current: CURRENT, collections: [] });
    // collections가 비면 targetId 기본값이 __new__
    fireEvent.change(screen.getByPlaceholderText("새 컬렉션 이름"), { target: { value: "스모크" } });
    fireEvent.click(screen.getByText("현재 요청 저장"));
    const next = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("스모크");
    expect(next[0].requests).toHaveLength(1);
  });

  it("불러오기가 onLoad + onClose 호출", () => {
    const { onLoad, onClose } = setup();
    fireEvent.click(screen.getByText("불러오기"));
    expect(onLoad).toHaveBeenCalledWith(COLLECTIONS[0].requests[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it("요청 삭제가 해당 요청을 제거", () => {
    const { onChange } = setup();
    fireEvent.click(within(screen.getByText("유저 조회").closest(".saved-row")!).getByTitle("삭제"));
    const next = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    expect(next[0].requests).toHaveLength(0);
  });

  it("컬렉션 삭제가 onChange 호출", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTitle("컬렉션 삭제"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("가져오기: 파일을 읽어 컬렉션을 병합", async () => {
    openMock.mockResolvedValue("/tmp/c.json");
    readTextFileMock.mockResolvedValue(
      JSON.stringify({ swaggerman: "collections", collections: [{ id: "x", name: "가져온", requests: [] }] }),
    );
    const { onChange } = setup();
    fireEvent.click(screen.getByText("가져오기"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(screen.getByText(/가져왔습니다/)).toBeTruthy();
  });

  it("가져오기: 사용자가 취소하면(파일 없음) 변화 없음", async () => {
    openMock.mockResolvedValue(null);
    const { onChange } = setup();
    fireEvent.click(screen.getByText("가져오기"));
    await waitFor(() => expect(openMock).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("내보내기: 파일에 쓴다", async () => {
    saveMock.mockResolvedValue("/tmp/out.json");
    writeTextFileMock.mockResolvedValue(undefined);
    setup();
    fireEvent.click(screen.getByText("내보내기"));
    await waitFor(() => expect(writeTextFileMock).toHaveBeenCalled());
    expect(screen.getByText("내보냈습니다.")).toBeTruthy();
  });

  it("내보내기 실패 시 에러 메시지", async () => {
    saveMock.mockResolvedValue("/tmp/out.json");
    writeTextFileMock.mockRejectedValue(new Error("권한 없음"));
    setup();
    fireEvent.click(screen.getByText("내보내기"));
    await waitFor(() => expect(screen.getByText(/내보내기 실패/)).toBeTruthy());
  });
});

describe("인라인 편집", () => {
  it("✏️ 수정 클릭 시 인라인 폼이 열리고 저장하면 onChange에 반영된다(헤더·바디·id 보존)", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTitle("수정"));
    fireEvent.change(screen.getByDisplayValue("https://x/users"), { target: { value: "https://y/users" } });
    fireEvent.change(screen.getByDisplayValue("유저 조회"), { target: { value: "유저 목록" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    const updated = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    const r = updated[0].requests[0];
    expect(r.id).toBe("r1");
    expect(r.url).toBe("https://y/users");
    expect(r.name).toBe("유저 목록");
    expect(r.headers).toEqual([{ key: "X-Token", value: "t1" }]);
    expect(r.body).toBe('{"q":1}');
    expect(r.folder).toBe("유저");
  });

  it("URL을 비우면 저장 버튼이 비활성화된다", () => {
    setup();
    fireEvent.click(screen.getByTitle("수정"));
    fireEvent.change(screen.getByDisplayValue("https://x/users"), { target: { value: "" } });
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("취소하면 편집 폼이 닫히고 변경되지 않는다", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTitle("수정"));
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText("유저 조회")).toBeTruthy();
  });
});

describe("불러온 요청에 덮어쓰기", () => {
  it("loadedSavedId가 있으면 덮어쓰기 버튼으로 해당 요청을 교체한다(이름 보존)", () => {
    const { onChange } = setup({ current: CURRENT, loadedSavedId: "r1" });
    fireEvent.click(screen.getByRole("button", { name: "불러온 요청에 덮어쓰기" }));
    const updated = vi.mocked(onChange).mock.calls[0][0] as Collection[];
    const r = updated[0].requests[0];
    expect(r.id).toBe("r1");
    expect(r.name).toBe("유저 조회"); // 이름 입력이 없으면 기존 이름 유지
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://x/users");
    expect(r.headers).toEqual([{ key: "A", value: "1" }]); // enabled 헤더만 저장
    expect(r.body).toBe('{"a":1}');
    expect(r.folder).toBe("유저");
  });

  it("loadedSavedId가 컬렉션에 없으면 덮어쓰기 버튼을 숨긴다", () => {
    setup({ current: CURRENT, loadedSavedId: "ghost" });
    expect(screen.queryByRole("button", { name: "불러온 요청에 덮어쓰기" })).toBeNull();
  });

  it("loadedSavedId가 없으면 덮어쓰기 버튼이 없다", () => {
    setup({ current: CURRENT });
    expect(screen.queryByRole("button", { name: "불러온 요청에 덮어쓰기" })).toBeNull();
  });
});
