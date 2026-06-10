import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "../core/fs";
import {
  exportCollections,
  importCollections,
  requestToSaved,
  type Collection,
  type SavedRequest,
} from "../core/collections";
import { newId } from "../core/history";
import { methodColor } from "./method";
import { CloseCircleIcon, TrashIcon, EditIcon } from "./icons";
import { HTTP_METHODS } from "../core/types";
import { useEscToClose } from "./useEscToClose";
import { Select } from "./Select";

interface CurrentRequest {
  method: string;
  url: string;
  headers: { key: string; value: string; enabled: boolean }[];
  body: string;
}

interface Props {
  collections: Collection[];
  onChange: (c: Collection[]) => void;
  current: CurrentRequest | null;
  onLoad: (s: SavedRequest) => void;
  onClose: () => void;
  /** 현재 편집 중인 요청이 컬렉션에서 불러온 것이면 그 SavedRequest id (App이 selected.id "saved:" 접두사에서 파생) */
  loadedSavedId?: string | null;
}

export function CollectionsModal({ collections, onChange, current, onLoad, onClose, loadedSavedId }: Props) {
  // ESC 키로 닫기
  useEscToClose(onClose);

  const [saveName, setSaveName] = useState("");
  const [targetId, setTargetId] = useState(collections[0]?.id ?? "__new__");
  const [newColName, setNewColName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // 인라인 편집(한 번에 한 행): 이름·메서드·URL만. 헤더/바디는 불러오기→덮어쓰기로 수정.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", method: "GET", url: "" });

  const startEdit = (r: SavedRequest) => {
    setEditingId(r.id);
    setDraft({ name: r.name, method: r.method, url: r.url });
  };

  const saveEdit = (colId: string, reqId: string) => {
    onChange(
      collections.map((c) =>
        c.id === colId
          ? {
              ...c,
              requests: c.requests.map((r) =>
                r.id === reqId
                  ? { ...r, name: draft.name.trim() || draft.url.trim(), method: draft.method, url: draft.url.trim() }
                  : r,
              ),
            }
          : c,
      ),
    );
    setEditingId(null);
  };

  // 기본 요청 이름: URL 경로(없으면 호스트/원문) — "GET 요청"만 쌓여 구분 안 되는 문제 방지
  const defaultName = (() => {
    if (!current) return "";
    try {
      const u = new URL(current.url);
      return u.pathname && u.pathname !== "/" ? u.pathname : u.host;
    } catch {
      return current.url;
    }
  })();

  const addCollection = (name: string): Collection => {
    const col = { id: newId(), name: name || `컬렉션 ${collections.length + 1}`, requests: [] };
    onChange([...collections, col]);
    return col;
  };

  const saveCurrent = () => {
    if (!current) return;
    const saved = requestToSaved(
      saveName || defaultName || `${current.method} 요청`,
      current.method,
      current.url,
      current.headers,
      current.body,
    );
    let cols = collections;
    let id = targetId;
    if (targetId === "__new__") {
      const col = { id: newId(), name: newColName || "새 컬렉션", requests: [] as SavedRequest[] };
      cols = [...collections, col];
      id = col.id;
    }
    onChange(cols.map((c) => (c.id === id ? { ...c, requests: [...c.requests, saved] } : c)));
    setSaveName("");
    setNewColName("");
    setMsg("현재 요청을 저장했습니다.");
  };

  // 불러온 요청 덮어쓰기: method/url/headers/body 교체, 이름은 입력 없으면 보존, id/folder 보존
  const loadedCol = loadedSavedId
    ? collections.find((c) => c.requests.some((r) => r.id === loadedSavedId))
    : undefined;

  const overwriteLoaded = () => {
    if (!current || !loadedSavedId || !loadedCol) return;
    let updatedName = "";
    onChange(
      collections.map((c) =>
        c.id !== loadedCol.id
          ? c
          : {
              ...c,
              requests: c.requests.map((r) => {
                if (r.id !== loadedSavedId) return r;
                updatedName = saveName.trim() || r.name;
                return {
                  ...r,
                  name: updatedName,
                  method: current.method,
                  url: current.url,
                  headers: current.headers.filter((h) => h.enabled && h.key).map((h) => ({ key: h.key, value: h.value })),
                  body: current.body,
                };
              }),
            },
      ),
    );
    setSaveName("");
    setMsg(`『${updatedName}』에 덮어썼습니다.`);
  };

  const removeRequest = (colId: string, reqId: string) =>
    onChange(
      collections.map((c) =>
        c.id === colId ? { ...c, requests: c.requests.filter((r) => r.id !== reqId) } : c,
      ),
    );
  const removeCollection = (colId: string) =>
    onChange(collections.filter((c) => c.id !== colId));

  const doImport = async () => {
    try {
      const path = await open({
        multiple: false,
        title: "컬렉션 가져오기 (Postman v2.1 / SwaggerMan)",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const text = await readTextFile(path);
      const imported = importCollections(text);
      onChange([...collections, ...imported]);
      setMsg(`${imported.length}개 컬렉션을 가져왔습니다.`);
    } catch (e) {
      setMsg(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const doExport = async () => {
    try {
      const path = await save({
        title: "컬렉션 내보내기",
        defaultPath: "swaggerman-collections.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      await writeTextFile(path, exportCollections(collections));
      setMsg("내보냈습니다.");
    } catch (e) {
      setMsg(`내보내기 실패: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal collections-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>컬렉션</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          <div className="col-actions">
            <button className="btn small" onClick={doImport}>
              가져오기
            </button>
            <button className="btn small" onClick={doExport} disabled={collections.length === 0}>
              내보내기
            </button>
            <button className="btn small" onClick={() => addCollection("")}>
              + 새 컬렉션
            </button>
            {msg && <span className="col-msg">{msg}</span>}
          </div>

          {current && (
            <div className="col-save">
              <input
                className="kv-input"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder={defaultName || "요청 이름"}
                spellCheck={false}
              />
              <Select
                value={targetId}
                onChange={setTargetId}
                options={[
                  ...collections.map((c) => ({ value: c.id, label: c.name })),
                  { value: "__new__", label: "+ 새 컬렉션…" },
                ]}
              />
              {targetId === "__new__" && (
                <input
                  className="kv-input"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  placeholder="새 컬렉션 이름"
                  spellCheck={false}
                />
              )}
              <button className="btn small primary" onClick={saveCurrent}>
                현재 요청 저장
              </button>
              {loadedCol && (
                <button className="btn small" onClick={overwriteLoaded} title="불러온 저장 요청을 현재 편집 내용으로 교체">
                  불러온 요청에 덮어쓰기
                </button>
              )}
            </div>
          )}

          {collections.length === 0 && (
            <div className="hint">컬렉션이 없습니다. 가져오거나 새로 만들어 보세요.</div>
          )}
          {collections.map((col) => (
            <div className="col-card" key={col.id}>
              <div className="col-card-head">
                <span className="col-name">
                  {col.name} <span className="muted">({col.requests.length})</span>
                </span>
                <button
                  className="btn small icon danger"
                  onClick={() => removeCollection(col.id)}
                  title="컬렉션 삭제"
                >
                  <TrashIcon />
                </button>
              </div>
              {col.requests.map((r) =>
                editingId === r.id ? (
                  <div className="saved-row saved-edit" key={r.id}>
                    <Select
                      value={draft.method}
                      onChange={(m) => setDraft((d) => ({ ...d, method: m }))}
                      options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
                    />
                    <input
                      className="kv-input"
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="요청 이름"
                      spellCheck={false}
                    />
                    <input
                      className="kv-input saved-edit-url"
                      value={draft.url}
                      onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                      placeholder="https://api.example.com/path"
                      spellCheck={false}
                    />
                    <button className="btn small primary" disabled={!draft.url.trim()} onClick={() => saveEdit(col.id, r.id)}>
                      저장
                    </button>
                    <button className="btn small" onClick={() => setEditingId(null)}>
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="saved-row" key={r.id}>
                    <span className="method-mini" style={{ color: methodColor(r.method) }}>
                      {r.method}
                    </span>
                    <span className="saved-name" title={r.url}>
                      {r.folder ? <span className="saved-folder">{r.folder}/</span> : null}
                      {r.name}
                    </span>
                    <button
                      className="btn small"
                      onClick={() => {
                        onLoad(r);
                        onClose();
                      }}
                    >
                      불러오기
                    </button>
                    <button className="icon-btn" title="수정" onClick={() => startEdit(r)}>
                      <EditIcon size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => removeRequest(col.id, r.id)} title="삭제">
                      <CloseCircleIcon size={15} />
                    </button>
                  </div>
                ),
              )}
            </div>
          ))}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
