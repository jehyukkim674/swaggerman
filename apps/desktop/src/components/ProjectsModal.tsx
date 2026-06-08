import { useState } from "react";
import { CloseCircleIcon, TrashIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { isFileProject } from "../core/imported-spec-store";

export interface ProjectEntry {
  url: string;
  title: string;
  fileName?: string;
}

interface Props {
  projects: ProjectEntry[];
  activeUrl: string;
  /** 이름/URL 인라인 편집 결과를 저장(전체 목록 교체). */
  onUpdate: (projects: ProjectEntry[]) => void;
  /** 해당 URL 스펙을 로드(모달은 닫힘). */
  onLoad: (url: string) => void;
  /** 프로젝트 삭제(히스토리/즐겨찾기 등 함께 정리). */
  onDelete: (url: string) => void;
  /** 새 프로젝트 추가 후 로드. */
  onAdd: (title: string, url: string) => void;
  /** 파일에서 새 프로젝트 가져오기(성공 메시지 반환, 취소 시 ""). */
  onImportFile: () => Promise<string>;
  /** 파일 프로젝트 스냅샷을 새 파일로 갱신(성공 메시지 반환, 취소 시 ""). */
  onReimportFile: (url: string) => Promise<string>;
  onClose: () => void;
}

/** 프로젝트(이름 + 스펙 URL) 목록 관리: 추가 · 인라인 수정 · 삭제 · 열기. */
export function ProjectsModal({ projects, activeUrl, onUpdate, onLoad, onDelete, onAdd, onImportFile, onReimportFile, onClose }: Props) {
  // ESC 키로 닫기
  useEscToClose(onClose);

  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const runImport = async () => {
    setMsg("");
    setBusy(true);
    try {
      const m = await onImportFile();
      if (m) setMsg(m);
    } catch (e) {
      setMsg(`가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const runReimport = async (url: string) => {
    setMsg("");
    setBusy(true);
    try {
      const m = await onReimportFile(url);
      if (m) setMsg(m);
    } catch (e) {
      setMsg(`다시 가져오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const patch = (index: number, p: Partial<ProjectEntry>) =>
    onUpdate(projects.map((it, i) => (i === index ? { ...it, ...p } : it)));

  const canAdd = newUrl.trim().length > 0;
  const add = () => {
    if (!canAdd) return;
    onAdd(newTitle.trim() || newUrl.trim(), newUrl.trim());
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal projects-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>프로젝트 관리</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body">
          {projects.length === 0 && <div className="hint">저장된 프로젝트가 없습니다. 아래에서 추가하세요.</div>}

          {projects.map((p, i) => {
            const file = isFileProject(p.url);
            return (
              <div className={p.url === activeUrl ? "proj-row active" : "proj-row"} key={p.url}>
                <input
                  className="proj-name"
                  value={p.title}
                  onChange={(e) => patch(i, { title: e.target.value })}
                  placeholder="이름"
                  spellCheck={false}
                  title="프로젝트 이름"
                />
                {file ? (
                  <span className="proj-file" title="가져온 파일">
                    <span aria-hidden="true">📄</span> {p.fileName || "(파일)"}
                  </span>
                ) : (
                  <input
                    className="proj-url"
                    value={p.url}
                    onChange={(e) => patch(i, { url: e.target.value })}
                    placeholder="스펙 URL"
                    spellCheck={false}
                    title="OpenAPI 스펙 URL"
                  />
                )}
                <button className="btn small" onClick={() => onLoad(p.url)} title="이 스펙을 불러오기">
                  열기
                </button>
                {file && (
                  <button
                    className="btn small"
                    onClick={() => runReimport(p.url)}
                    title="파일에서 다시 가져오기(히스토리 보존)"
                    disabled={busy}
                  >
                    다시 가져오기
                  </button>
                )}
                <button
                  className="btn small icon danger"
                  onClick={() => onDelete(p.url)}
                  title="삭제(히스토리·즐겨찾기 포함)"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}

          <div className="proj-add">
            <div className="field-label">새 프로젝트 추가</div>
            <div className="proj-import-row">
              <button className="btn small" onClick={runImport} title="OpenAPI 스펙 파일(JSON/YAML)에서 가져오기" disabled={busy}>
                파일에서 가져오기
              </button>
              {msg && <span className="hint">{msg}</span>}
            </div>
            <div className="proj-row">
              <input
                className="proj-name"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="이름(비우면 URL)"
                spellCheck={false}
              />
              <input
                className="proj-url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="스펙 URL (예: /v3/api-docs)"
                spellCheck={false}
              />
              <button className="btn small primary" onClick={add} disabled={!canAdd}>
                추가
              </button>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <div className="hint" style={{ marginRight: "auto" }}>
            이름·URL은 입력 즉시 저장됩니다. URL을 바꾼 뒤 <strong>열기</strong>로 다시 로드하세요.
          </div>
          <button className="btn" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
