import { ScanMode } from '../types';

interface ScanStatusBarProps {
  scanMode: ScanMode;
  isScanning: boolean;
  rangeLabel: string;
  totalHosts: number;
  scannedHostCount: number;
  activeHostCount: number;
  openPortCount: number;
  scanDuration: number;
  localIp: string;
}

const MODE_LABELS: Record<ScanMode, string> = {
  ip: 'IP 探活',
  port: '端口扫描',
};

export function ScanStatusBar({
  scanMode,
  isScanning,
  rangeLabel,
  totalHosts,
  scannedHostCount,
  activeHostCount,
  openPortCount,
  scanDuration,
  localIp,
}: ScanStatusBarProps) {
  const targetLabel = scanMode === 'port' ? '目标 IP' : '扫描目标';
  const items = [
    ['当前模式', MODE_LABELS[scanMode]],
    [targetLabel, rangeLabel],
    ['主机总数', String(totalHosts)],
    ['已完成', String(scannedHostCount)],
    [scanMode === 'ip' ? '在线主机' : '命中主机', String(activeHostCount)],
    ['开放端口总数', String(openPortCount)],
    ['本机 IP', localIp || '获取中'],
    ['耗时', `${scanDuration} ms`],
    ['当前状态', isScanning ? '扫描中' : '待命'],
  ] as const;

  return (
    <section className="panel status-bar">
      <div className="status-track">
        {items.map(([label, value], index) => (
          <div key={label} className="status-entry">
            <div className="status-item">
              <span className="status-item-label">{label}</span>
              <strong className="status-item-value">{value}</strong>
            </div>
            {index < items.length - 1 ? (
              <span className="status-separator" aria-hidden="true">
                /
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
