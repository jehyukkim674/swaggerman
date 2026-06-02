import { useEscToClose } from "./useEscToClose";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 공용 확인 다이얼로그 — 새 창 열기 등 의도 확인이 필요한 동작 전에 띄운다.
 *  Esc / 배경 클릭 / 취소 버튼 = 취소. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "확인",
  cancelLabel = "취소",
  onConfirm,
  onCancel,
}: Props) {
  useEscToClose(onCancel);
  return (
    <div className="modal-overlay" onMouseDown={onCancel}>
      <div
        className="modal confirm-dialog"
        role="alertdialog"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">{title}</div>
        <div className="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn primary" autoFocus onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
