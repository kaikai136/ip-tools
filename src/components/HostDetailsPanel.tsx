import { HostInfo, ScanMode } from '../types';

interface HostDetailsPanelProps {
  host: number | null;
  hostInfo?: HostInfo;
  scanMode: ScanMode;
}

const STATUS_LABELS: Record<HostInfo['status'], string> = {
  online: '在线',
  offline: '离线',
  scanning: '扫描中',
  untested: '待开始',
};

const MODE_LABELS: Record<ScanMode, string> = {
  ip: 'IP 探活',
  port: '端口扫描',
};

export function HostDetailsPanel({ host, hostInfo, scanMode }: HostDetailsPanelProps) {
  if (host === null || !hostInfo) {
    return (
      <aside className="panel host-details">
        <div className="section-head">
          <div>
            <p className="section-kicker">Host Details</p>
            <h2>主机详情</h2>
          </div>
        </div>
        <div className="empty-state">
          <p>从中间网格中选中一台主机，就可以查看它的状态、响应时间和端口结果。</p>
        </div>
      </aside>
    );
  }

  const portsSummary =
    scanMode === 'ip'
      ? '当前结果来自 IP 探活，本次没有执行端口扫描。'
      : hostInfo.openPorts.length
        ? null
        : hostInfo.scannedPorts
          ? '当前未发现开放端口。'
          : '端口扫描尚未返回结果。';

  return (
    <aside className="panel host-details">
      <div className="section-head">
        <div>
          <p className="section-kicker">Host Details</p>
          <h2>{hostInfo.ip}</h2>
        </div>
        <span className={`status-pill ${hostInfo.status}`}>{STATUS_LABELS[hostInfo.status]}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <span className="detail-label">主机号</span>
          <strong>{host}</strong>
        </div>
        <div className="detail-card">
          <span className="detail-label">扫描模式</span>
          <strong>{MODE_LABELS[scanMode]}</strong>
        </div>
        <div className="detail-card">
          <span className="detail-label">响应时间</span>
          <strong>{hostInfo.responseTime ? `${hostInfo.responseTime} ms` : '--'}</strong>
        </div>
        <div className="detail-card">
          <span className="detail-label">已扫端口数</span>
          <strong>{hostInfo.scannedPorts}</strong>
        </div>
        <div className="detail-card">
          <span className="detail-label">开放端口数</span>
          <strong>{hostInfo.openPorts.length}</strong>
        </div>
      </div>

      <div className="ports-block">
        <h3>开放端口</h3>
        {hostInfo.openPorts.length ? (
          <div className="port-list">
            {hostInfo.openPorts.map((port) => (
              <span key={port} className="port-chip">
                {port}
              </span>
            ))}
          </div>
        ) : (
          <p className="ports-empty">{portsSummary}</p>
        )}
      </div>
    </aside>
  );
}
