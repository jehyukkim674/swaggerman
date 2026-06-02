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
import { CloseCircleIcon, TrashIcon } from "./icons";
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
}

export function CollectionsModal({ collections, onChange, current, onLoad, onClose }: Props) {
  // ESC 키로 닫기
  useEscToClose(onClose);

  const [saveName, setSaveName] = useState("");
  const [targetId, setTargetId] = useState(collections[0]?.id ?? "__new__");
  const [newColName, setNewColName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const addCollection = (name: string): Collection => {
    const col = { id: newId(), name: name || `컬렉션 ${collections.length + 1}`, requests: [] };
    onChange([...collections, col]);
    return col;
  };

  const saveCurrent = () => {
    if (!current) return;
    const saved = requestToSaved(
      saveName || `${current.method} 요청`,
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
                placeholder="요청 이름"
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
              {col.requests.map((r) => (
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
                  <button
                    className="icon-btn"
                    onClick={() => removeRequest(col.id, r.id)}
                    title="삭제"
                  >
                    <CloseCircleIcon size={15} />
                  </button>
                </div>
              ))}
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
