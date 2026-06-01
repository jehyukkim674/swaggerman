import { useState } from "react";

interface Props {
  initialTitle: string;
  initialUrl: string;
  /** reload=true면 저장 후 해당 URL로 스펙을 다시 로드한다. */
  onSave: (title: string, url: string, reload: boolean) => void;
  onClose: () => void;
}

/** 프로젝트(이름 + 스펙 URL) 편집 팝업. URL 변경 시 재로딩 가능. */
export function ProjectEditModal({ initialTitle, initialUrl, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [url, setUrl] = useState(initialUrl);
  const trimmedUrl = url.trim();
  const urlChanged = trimmedUrl !== initialUrl;
  const canSave = trimmedUrl.length > 0;

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>프로젝트 편집</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label className="field-label">이름</label>
          <input
            className="spec-url"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="프로젝트 이름 (비우면 URL 사용)"
            spellCheck={false}
            autoFocus
          />
          <label className="field-label" style={{ marginTop: 12 }}>
            스펙 URL
          </label>
          <input
            className="spec-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="OpenAPI spec URL (예: /v3/api-docs)"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave) onSave(title, trimmedUrl, true);
            }}
          />
          <div className="hint">
            {urlChanged
              ? "URL이 변경되어 저장 시 새 스펙을 다시 로드합니다."
              : "이름만 바꾸려면 [저장], 현재 URL로 새로고침하려면 [저장 후 다시 로드]."}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button
            className="btn"
            disabled={!canSave}
            onClick={() => onSave(title, trimmedUrl, urlChanged)}
          >
            저장
          </button>
          <button
            className="btn primary"
            disabled={!canSave}
            onClick={() => onSave(title, trimmedUrl, true)}
          >
            저장 후 다시 로드
          </button>
        </div>
      </div>
    </div>
  );
}
