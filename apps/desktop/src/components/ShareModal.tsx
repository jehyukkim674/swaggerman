// 요청 공유: 내보내기(코드 생성·복사) / 가져오기(붙여넣기·적용) 모달.
import { useEffect, useState } from "react";
import { encodeShare, decodeShare, type ShareableRequest } from "../core/share";
import { CloseCircleIcon, CopyIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";

interface Props {
  /** 내보낼 현재 요청 (없으면 내보내기 탭 비활성) */
  current: ShareableRequest | null;
  /** 가져오기 적용 콜백 */
  onApply: (req: ShareableRequest) => void;
  onClose: () => void;
}

export function ShareModal({ current, onApply, onClose }: Props) {
  useEscToClose(onClose);
  // current가 없으면 가져오기 탭이 기본
  const [tab, setTab] = useState<"export" | "import">(current ? "export" : "import");

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal share-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>요청 공유</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>
        <div className="share-tabs">
          <button
            className={tab === "export" ? "active" : ""}
            disabled={!current}
            onClick={() => setTab("export")}
          >
            내보내기
          </button>
          <button className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
            가져오기
          </button>
        </div>
        <div className="modal-body">
          {tab === "export" && current && <ExportTab current={current} />}
          {tab === "import" && <ImportTab onApply={onApply} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}

function ExportTab({ current }: { current: ShareableRequest }) {
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [code, setCode] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    encodeShare(current, { includeSecrets }).then(async (c) => {
      if (!alive) return;
      setCode(c);
      // 제외된 민감 헤더 목록: includeSecrets이면 빈 배열, 아니면 decode해서 확인
      if (includeSecrets) {
        setExcluded([]);
      } else {
        const decoded = await decodeShare(c);
        if (alive) setExcluded(decoded.excludedSecrets ?? []);
      }
    });
    return () => {
      alive = false;
    };
  }, [current, includeSecrets]);

  return (
    <div className="share-export">
      <p className="hint">이 코드를 복사해 동료에게 전달하세요. 받는 쪽은 "가져오기"에 붙여넣습니다.</p>
      <textarea className="share-code" aria-label="공유 코드" readOnly value={code} rows={4} />
      <div className="share-actions">
        <button
          className="btn small primary"
          onClick={() => {
            navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          <CopyIcon size={13} /> {copied ? "복사됨" : "복사"}
        </button>
        <label className="share-secret-toggle">
          <input
            type="checkbox"
            checked={includeSecrets}
            onChange={(e) => setIncludeSecrets(e.target.checked)}
            aria-label="민감정보 포함"
          />
          민감정보 포함
        </label>
      </div>
      {includeSecrets ? (
        <div className="share-warn">
          ⚠️ 토큰·비밀번호 등 민감 헤더가 코드에 포함됩니다. 신뢰하는 사람에게만 전달하세요.
        </div>
      ) : (
        excluded.length > 0 && (
          <div className="share-note">
            🔒 민감 헤더 {excluded.length}개 제외됨: {excluded.join(", ")}
          </div>
        )
      )}
    </div>
  );
}

function ImportTab({
  onApply,
  onClose,
}: {
  onApply: (req: ShareableRequest) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ShareableRequest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onText = (value: string) => {
    setText(value);
    setError(null);
    setPreview(null);
    if (!value.trim()) return;
    decodeShare(value)
      .then(setPreview)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="share-import">
      <p className="hint">받은 공유 코드를 붙여넣으면 현재 요청 화면에 적용됩니다.</p>
      <textarea
        className="share-code"
        aria-label="공유 코드 입력"
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="swaggerman:req:..."
        rows={4}
        spellCheck={false}
      />
      {error && <div className="share-warn">{error}</div>}
      {preview && (
        <div className="share-preview">
          <div className="share-preview-line">
            <span className="method">{preview.method}</span> {preview.url}
          </div>
          <div className="share-preview-meta">
            헤더 {preview.headers.length}개
            {preview.body ? " · Body 있음" : ""}
            {preview.note ? " · 메모 포함" : ""}
          </div>
          {preview.excludedSecrets && preview.excludedSecrets.length > 0 && (
            <div className="share-note">
              🔒 보낸 사람이 민감 헤더 {preview.excludedSecrets.length}개를 제외함:{" "}
              {preview.excludedSecrets.join(", ")}
            </div>
          )}
        </div>
      )}
      <div className="share-actions">
        <button
          className="btn small primary"
          disabled={!preview}
          onClick={() => {
            if (preview) {
              onApply(preview);
              onClose();
            }
          }}
        >
          적용
        </button>
      </div>
    </div>
  );
}
