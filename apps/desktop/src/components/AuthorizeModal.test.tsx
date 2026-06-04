// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { AuthorizeModal } from "./AuthorizeModal";
import type { ParsedSecurityScheme } from "../core/types";
import type { OAuth2Config } from "../core/oauth2";

const SCHEMES: ParsedSecurityScheme[] = [
  { name: "BearerAuth", kind: { kind: "http", scheme: "bearer" } },
  { name: "ApiKey", kind: { kind: "apiKey", name: "X-API-Key", location: "header" } },
];

const OAUTH2: OAuth2Config = {
  tokenUrl: "",
  grant: "client_credentials",
  clientId: "",
  clientSecret: "",
  scope: "",
  username: "",
  password: "",
  targetScheme: "",
};

function setup(over: Partial<Parameters<typeof AuthorizeModal>[0]> = {}) {
  const props = {
    schemes: SCHEMES,
    values: {} as Record<string, string>,
    onChange: vi.fn(),
    onClose: vi.fn(),
    oauth2: OAUTH2,
    onOauth2Change: vi.fn(),
    onFetchToken: vi.fn(),
    ...over,
  };
  render(<AuthorizeModal {...props} />);
  return props;
}

describe("AuthorizeModal", () => {
  it("보안 스킴이 없으면 안내 힌트", () => {
    setup({ schemes: [] });
    expect(screen.getByText(/보안 스킴이 없습니다/)).toBeTruthy();
  });

  it("각 스킴을 행으로 렌더한다", () => {
    const { container } = render(
      <AuthorizeModal
        schemes={SCHEMES}
        values={{}}
        onChange={vi.fn()}
        onClose={vi.fn()}
        oauth2={OAUTH2}
        onOauth2Change={vi.fn()}
        onFetchToken={vi.fn()}
      />,
    );
    const names = Array.from(container.querySelectorAll(".auth-name")).map((n) => n.textContent);
    expect(names).toEqual(["BearerAuth", "ApiKey"]);
  });

  it("값 입력 후 Authorize가 해당 스킴만 커밋", () => {
    const { onChange } = setup();
    const inputs = screen.getAllByPlaceholderText("토큰 / 값 입력");
    fireEvent.change(inputs[0], { target: { value: "  tok123  " } });
    fireEvent.click(screen.getAllByText("Authorize")[0]);
    expect(onChange).toHaveBeenCalledWith({ BearerAuth: "tok123" });
  });

  it("커밋된 스킴은 Logout 버튼 + 적용됨 배지를 보인다", () => {
    setup({ values: { BearerAuth: "abc" } });
    expect(screen.getByText("Logout")).toBeTruthy();
    expect(screen.getByText("적용됨")).toBeTruthy();
  });

  it("Logout이 해당 값을 제거", () => {
    const { onChange } = setup({ values: { BearerAuth: "abc" } });
    fireEvent.click(screen.getByText("Logout"));
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("값 보기/숨기기 토글이 input type을 바꾼다", () => {
    setup({ values: { BearerAuth: "secret" } });
    const input = screen.getAllByPlaceholderText("토큰 / 값 입력")[0] as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.click(screen.getByTitle("값 보기"));
    expect(input.type).toBe("text");
  });

  it("'모두 저장'이 모든 스킴을 커밋하고 닫는다", () => {
    const { onChange, onClose } = setup();
    fireEvent.change(screen.getAllByPlaceholderText("토큰 / 값 입력")[0], { target: { value: "t1" } });
    fireEvent.click(screen.getByText("모두 저장"));
    expect(onChange).toHaveBeenCalledWith({ BearerAuth: "t1", ApiKey: "" });
    expect(onClose).toHaveBeenCalled();
  });

  it("토큰 URL이 비면 토큰 발급 버튼 비활성", () => {
    setup();
    expect((screen.getByText("토큰 발급") as HTMLButtonElement).disabled).toBe(true);
  });

  it("토큰 발급 성공 시 대상 스킴에 채우고 성공 메시지", async () => {
    const onFetchToken = vi.fn().mockResolvedValue({ accessToken: "ISSUED" });
    const onChange = vi.fn();
    setup({
      onFetchToken,
      onChange,
      oauth2: { ...OAUTH2, tokenUrl: "https://t", targetScheme: "BearerAuth" },
    });
    fireEvent.click(screen.getByText("토큰 발급"));
    await waitFor(() => expect(screen.getByText(/발급 완료/)).toBeTruthy());
    expect(onChange).toHaveBeenCalledWith({ BearerAuth: "ISSUED" });
  });

  it("토큰 발급 실패 시 에러 메시지", async () => {
    const onFetchToken = vi.fn().mockRejectedValue(new Error("invalid_client"));
    setup({ onFetchToken, oauth2: { ...OAUTH2, tokenUrl: "https://t" } });
    fireEvent.click(screen.getByText("토큰 발급"));
    await waitFor(() => expect(screen.getByText("invalid_client")).toBeTruthy());
  });

  it("Grant를 password로 바꾸면 Username/Password 필드가 나타난다", () => {
    const { onOauth2Change } = setup();
    const grantSelect = document.querySelector(".oauth2-field .select-trigger, .oauth2-field button") as HTMLElement;
    fireEvent.click(grantSelect);
    const listbox = screen.getByRole("listbox");
    fireEvent.mouseDown(within(listbox).getByText("password"));
    expect(onOauth2Change).toHaveBeenCalledWith(expect.objectContaining({ grant: "password" }));
  });

  it("password grant면 Username/Password 입력을 노출하고 편집할 수 있다", () => {
    const { onOauth2Change } = setup({ oauth2: { ...OAUTH2, grant: "password", tokenUrl: "https://t" } });
    const user = screen.getByText("Username").closest("label")!.querySelector("input")!;
    fireEvent.change(user, { target: { value: "kim" } });
    expect(onOauth2Change).toHaveBeenCalledWith(expect.objectContaining({ username: "kim" }));
  });

  it("OAuth2 필드(Token URL/Client ID/Scope)를 편집할 수 있다", () => {
    const { onOauth2Change } = setup();
    fireEvent.change(screen.getByPlaceholderText(/oauth\/token/), { target: { value: "https://auth/token" } });
    expect(onOauth2Change).toHaveBeenCalledWith(expect.objectContaining({ tokenUrl: "https://auth/token" }));
    fireEvent.change(screen.getByPlaceholderText("read write"), { target: { value: "read" } });
    expect(onOauth2Change).toHaveBeenCalledWith(expect.objectContaining({ scope: "read" }));
  });
});
