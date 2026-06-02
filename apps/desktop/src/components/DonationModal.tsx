import { DONATION_URL } from "../core/donation";
import { CloseCircleIcon } from "./icons";
import { useEscToClose } from "./useEscToClose";
import { DonationQR } from "./DonationQR";

interface Props {
  onClose: () => void;
}

/** 카카오페이 후원 QR 모달 — 링크가 모바일 전용이라 PC에서는 휴대폰으로 QR을 스캔한다. */
export function DonationModal({ onClose }: Props) {
  useEscToClose(onClose);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal donation-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>☕ 개발자에게 커피 사주기</h3>
          <button className="icon-btn" onClick={onClose} title="닫기">
            <CloseCircleIcon size={18} />
          </button>
        </div>

        <div className="modal-body donation-body">
          <DonationQR size={180} />
          <p>
            휴대폰 <b>카메라</b> 또는 <b>카카오톡 스캔</b>으로 QR을 찍으면
            <br />
            카카오페이 송금 화면이 열려요.
          </p>
          <div className="hint donation-url">{DONATION_URL}</div>
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
