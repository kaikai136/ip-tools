import { HostInfo } from '../types';

interface IpGridProps {
  networkSegment: string;
  ipStatuses: Map<number, HostInfo>;
  previewRange: {
    start: number;
    end: number;
  };
  selectedHost: number | null;
  onSelectHost: (host: number) => void;
}

function getStatusLabel(status: HostInfo['status']) {
  switch (status) {
    case 'online':
      return '在线';
    case 'offline':
      return '无响应';
    case 'scanning':
      return '扫描中';
    default:
      return '待命';
  }
}

export function IpGrid({
  networkSegment,
  ipStatuses,
  previewRange,
  selectedHost,
  onSelectHost,
}: IpGridProps) {
  const cells = [];

  for (let host = 1; host <= 254; host += 1) {
    const hostInfo = ipStatuses.get(host);
    const ip = hostInfo?.ip ?? `${networkSegment}.${host}`;
    const isInRange = host >= previewRange.start && host <= previewRange.end;
    const isSelected = selectedHost === host;
    const status = hostInfo?.status ?? 'untested';

    const classes = ['ip-cell', status];
    if (!isInRange) classes.push('out-of-range');
    if (isSelected) classes.push('selected');

    const title = [
      ip,
      `状态: ${getStatusLabel(status)}`,
      typeof hostInfo?.responseTime === 'number' ? `延迟: ${hostInfo.responseTime} ms` : '延迟: -',
      hostInfo?.openPorts.length ? `开放端口: ${hostInfo.openPorts.join(', ')}` : '开放端口: 无',
    ].join('\n');

    cells.push(
      <button
        key={host}
        type="button"
        className={classes.join(' ')}
        title={title}
        aria-label={title}
        onClick={() => onSelectHost(host)}
      >
        <span className="ip-host">{host}</span>
      </button>,
    );
  }

  return <div className="ip-grid">{cells}</div>;
}
