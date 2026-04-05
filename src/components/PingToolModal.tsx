import { useEffect } from 'react';

import { PingPanel } from './PingPanel';

interface PingToolModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTargetIp: string | null;
}

export function PingToolModal({ isOpen, onClose, selectedTargetIp }: PingToolModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="tool-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="ping-tool-modal panel" role="dialog" aria-modal="true" aria-label="Ping 工具">
        <div className="ping-tool-modal-head">
          <div>
            <h2>Ping 工具</h2>
            <p>支持直接输入 IP 或域名，也可以一键带入当前选中的主机地址。</p>
          </div>
          <button
            type="button"
            className="ping-tool-modal-close"
            onClick={onClose}
            aria-label="关闭 Ping 工具"
          >
            ×
          </button>
        </div>

        <div className="ping-tool-modal-body">
          <PingPanel selectedTargetIp={selectedTargetIp} variant="modal" />
        </div>
      </section>
    </div>
  );
}
