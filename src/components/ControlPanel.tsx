import { ScanMode } from '../types';

interface ControlPanelProps {
  scanMode: ScanMode;
  isScanning: boolean;
  portTargetIp: string | null;
  onStartIpScan: () => void;
  onStartPortScan: () => void;
  onStopScan: () => void;
}

export function ControlPanel({
  scanMode,
  isScanning,
  portTargetIp,
  onStartIpScan,
  onStartPortScan,
  onStopScan,
}: ControlPanelProps) {
  const description =
    scanMode === 'ip'
      ? '当前模式是 IP 探活，会直接扫描整个 1-254 主机范围。'
      : portTargetIp
        ? `当前模式是端口扫描，点击按钮后会对选中的 ${portTargetIp} 扫描默认端口 1-65535。`
        : '当前模式是端口扫描，请先在主机分布里点选一个目标 IP。';

  return (
    <section className="panel control-panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Live Control</p>
          <h2>扫描控制</h2>
        </div>
        <p className="section-copy control-copy">{description}</p>
      </div>

      <div className="button-stack">
        <button
          onClick={onStartIpScan}
          disabled={isScanning}
          className={`btn ${scanMode === 'ip' ? 'btn-primary' : 'btn-secondary'}`}
        >
          扫描 IP
        </button>
        <button
          onClick={onStartPortScan}
          disabled={isScanning || !portTargetIp}
          className={`btn ${scanMode === 'port' ? 'btn-primary' : 'btn-secondary'}`}
        >
          扫描端口
        </button>
        <button onClick={onStopScan} disabled={!isScanning} className="btn btn-secondary">
          停止扫描
        </button>
      </div>
    </section>
  );
}
