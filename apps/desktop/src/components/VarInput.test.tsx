// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { VarInput } from "./VarInput";

const VARS = ["targetIp", "$timestamp", "$randomInt"];

describe("VarInput 호버 툴팁", () => {
  it("{{변수}}가 있는 입력에 호버하면 출처와 실제 값을 보여준다", () => {
    const { container } = render(
      <VarInput
        value="http://{{targetIp}}/api"
        onChange={() => {}}
        vars={VARS}
        varDetails={{ targetIp: { value: "10.0.0.1", source: "환경: 운영" } }}
      />,
    );
    const wrap = container.querySelector(".var-input-wrap")!;
    fireEvent.mouseEnter(wrap);
    expect(screen.getByText("{{targetIp}}")).toBeTruthy();
    expect(screen.getByText("환경: 운영")).toBeTruthy();
    expect(screen.getByText("10.0.0.1")).toBeTruthy();
  });

  it("정의되지 않은 변수는 경고를 표시한다", () => {
    const { container } = render(
      <VarInput value="{{nope}}" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    expect(screen.getByText(/정의되지 않음/)).toBeTruthy();
  });

  it("동적 변수($timestamp 등)는 예시 값을 보여준다", () => {
    const { container } = render(
      <VarInput value="{{$timestamp}}" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    expect(screen.getByText("{{$timestamp}}")).toBeTruthy();
    expect(screen.getByText("동적 변수")).toBeTruthy();
    expect(screen.getByText(/예시/)).toBeTruthy();
  });

  it("변수가 없는 값은 호버해도 툴팁이 안 뜬다", () => {
    const { container } = render(
      <VarInput value="http://example.com" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    expect(document.querySelector(".var-tooltip")).toBeNull();
  });

  it("툴팁은 패널 overflow에 잘리지 않도록 body 최상위(포털)에 fixed로 렌더된다", () => {
    const { container } = render(
      <VarInput
        value="{{targetIp}}"
        onChange={() => {}}
        vars={VARS}
        varDetails={{ targetIp: { value: "10.0.0.1", source: "환경: 운영" } }}
      />,
    );
    fireEvent.mouseEnter(container.querySelector(".var-input-wrap")!);
    const tooltip = document.querySelector<HTMLElement>(".var-tooltip");
    expect(tooltip).toBeTruthy();
    // 포털: 컴포넌트 컨테이너 밖(body 직속 트리)에 렌더 → 부모 overflow에 안 잘림
    expect(container.contains(tooltip)).toBe(false);
    // fixed 포지셔닝(스크롤/패널과 무관하게 화면 기준 배치)
    expect(tooltip!.style.position).toBe("fixed");
  });

  it("기존 자동완성 동작은 그대로 동작한다", () => {
    const { container } = render(
      <VarInput value="" onChange={() => {}} vars={VARS} varDetails={{}} />,
    );
    const input = container.querySelector("input")!;
    fireEvent.change(input, { target: { value: "{{target" } });
    expect(screen.getByText("{{targetIp}}")).toBeTruthy();
  });
});

describe("VarInput 자동완성 키보드/삽입", () => {
  // controlled 컴포넌트 — value가 onChange로 갱신돼야 insert가 동작하므로 stateful 래퍼 사용
  function Harness({ initial = "", onChange }: { initial?: string; onChange: (v: string) => void }) {
    const [val, setVal] = useState(initial);
    return (
      <VarInput
        value={val}
        onChange={(v) => {
          setVal(v);
          onChange(v);
        }}
        vars={["token", "userId", "userName"]}
        varDetails={{}}
      />
    );
  }
  function setup(initial = "") {
    const onChange = vi.fn();
    const { container } = render(<Harness initial={initial} onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;
    return { input, onChange };
  }
  function type(input: HTMLInputElement, v: string, caret = v.length) {
    fireEvent.change(input, { target: { value: v, selectionStart: caret } });
    input.selectionStart = caret;
    input.selectionEnd = caret;
  }

  it("부분 이름으로 제안을 필터링한다", () => {
    const { input } = setup();
    type(input, "{{user");
    expect(screen.getByText("{{userId}}")).toBeTruthy();
    expect(screen.getByText("{{userName}}")).toBeTruthy();
    expect(screen.queryByText("{{token}}")).toBeNull();
  });

  it("제안 클릭(mouseDown)으로 토큰을 삽입한다", () => {
    const { input, onChange } = setup();
    type(input, "{{to");
    fireEvent.mouseDown(screen.getByText("{{token}}"));
    expect(onChange).toHaveBeenLastCalledWith("{{token}}");
  });

  it("ArrowDown→Enter로 두 번째 항목을 삽입한다", () => {
    const { input, onChange } = setup();
    type(input, "{{user");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith("{{userName}}");
  });

  it("ArrowUp은 첫 항목 위로 넘어가지 않는다", () => {
    const { input, onChange } = setup();
    type(input, "{{user");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(onChange).toHaveBeenLastCalledWith("{{userId}}");
  });

  it("Escape로 제안 목록을 닫는다", () => {
    const { input } = setup();
    type(input, "{{us");
    expect(screen.getByText("{{userId}}")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByText("{{userId}}")).toBeNull();
  });

  it("값 중간에 삽입해도 앞뒤 텍스트를 보존한다", () => {
    const { input, onChange } = setup();
    const v = "Bearer {{to and more";
    const caret = "Bearer {{to".length;
    type(input, v, caret);
    fireEvent.mouseDown(screen.getByText("{{token}}"));
    expect(onChange).toHaveBeenLastCalledWith("Bearer {{token}} and more");
  });
});
