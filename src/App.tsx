import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useState } from 'react';

import { ErrorMessage } from './components/ErrorMessage';
import { AuthenticatorModal } from './components/AuthenticatorModal';
import { IpGrid } from './components/IpGrid';
import { IPv4SubnettingModal } from './components/IPv4SubnettingModal';
import { PasswordGeneratorModal } from './components/PasswordGeneratorModal';
import { PingToolModal } from './components/PingToolModal';
import { PortScannerModal } from './components/PortScannerModal';
import { ScanStatusBar } from './components/ScanStatusBar';
import { loadConfig, saveConfig } from './utils/storage';
import { getHostNumber, validateNetworkSegment } from './utils/validation';
import {
  AppConfig,
  EVENTS,
  HostInfo,
  HostScanResultEvent,
  ScanCompleteEvent,
  ScanErrorEvent,
  ScanMode,
} from './types';

const DEFAULT_CONFIG: AppConfig = {
  networkSegment: '192.168.1',
  hostStart: '1',
  hostEnd: '254',
  portsInput: '1-65535',
};

const DEFAULT_RANGE = {
  start: 1,
  end: 254,
};


function normalizeConfig(storedConfig: Partial<AppConfig> | null): AppConfig {
  return {
    networkSegment: storedConfig?.networkSegment ?? DEFAULT_CONFIG.networkSegment,
    hostStart: DEFAULT_CONFIG.hostStart,
    hostEnd: DEFAULT_CONFIG.hostEnd,
    portsInput: DEFAULT_CONFIG.portsInput,
  };
}

function createInitialHostStatuses(
  networkSegment: string,
  scanningRange?: { start: number; end: number },
): Map<number, HostInfo> {
  const timestamp = Date.now();
  const statuses = new Map<number, HostInfo>();

  for (let host = 1; host <= DEFAULT_RANGE.end; host += 1) {
    const isScanning = Boolean(
      scanningRange && host >= scanningRange.start && host <= scanningRange.end,
    );

    statuses.set(host, {
      ip: `${networkSegment}.${host}`,
      status: isScanning ? 'scanning' : 'untested',
      openPorts: [],
      scannedPorts: 0,
      lastUpdated: timestamp,
    });
  }

  return statuses;
}

function App() {
  const initialConfig = normalizeConfig(loadConfig());

  const [scanConfig, setScanConfig] = useState(initialConfig);
  const [scanMode, setScanMode] = useState<ScanMode>('ip');
  const [ipStatuses, setIpStatuses] = useState<Map<number, HostInfo>>(
    () => createInitialHostStatuses(initialConfig.networkSegment),
  );
  const [isScanning, setIsScanning] = useState(false);
  const [scanDuration, setScanDuration] = useState(0);
  const [scanRange, setScanRange] = useState(DEFAULT_RANGE);
  const [selectedHost, setSelectedHost] = useState<number | null>(DEFAULT_RANGE.start);
  const [localIp, setLocalIp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPortScannerModalOpen, setIsPortScannerModalOpen] = useState(false);
  const [isPingModalOpen, setIsPingModalOpen] = useState(false);
  const [isSubnetModalOpen, setIsSubnetModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isAuthenticatorModalOpen, setIsAuthenticatorModalOpen] = useState(false);

  const networkSegmentError = validateNetworkSegment(scanConfig.networkSegment);
  const previewRange = DEFAULT_RANGE;
  const selectedTargetIp =
    selectedHost === null ? null : `${scanConfig.networkSegment}.${selectedHost}`;
  const currentHosts = Array.from(ipStatuses.entries())
    .filter(([host]) => host >= scanRange.start && host <= scanRange.end)
    .map(([, info]) => info);

  const scannedHostCount = currentHosts.filter(
    (info) => info.status === 'online' || info.status === 'offline',
  ).length;
  const activeHostCount = currentHosts.filter((info) => info.status === 'online').length;
  const openPortCount = currentHosts.reduce((total, info) => total + info.openPorts.length, 0);
  const totalHosts = scanRange.end - scanRange.start + 1;
  const statusTargetLabel =
    scanMode === 'port'
      ? `${scanConfig.networkSegment}.${scanRange.start}`
      : `${scanRange.start}-${scanRange.end}`;
  const toolbarHint = networkSegmentError
    ? networkSegmentError
    : scanMode === 'port'
      ? selectedTargetIp
        ? `将对 ${selectedTargetIp} 执行端口探测。`
        : '请先选中一个 IP。'
      : '将对 1-254 主机执行在线探测。';

  useEffect(() => {
    let isMounted = true;

    invoke<string>('get_local_ip')
      .then((ip) => {
        if (isMounted) {
          setLocalIp(ip);
        }
      })
      .catch((invokeError) => {
        console.error('Failed to get local IP:', invokeError);
      });

    const unlistenHostResult = listen<HostScanResultEvent>(EVENTS.HOST_SCAN_RESULT, ({ payload }) => {
      const host = getHostNumber(payload.ip);

      if (host < 1 || host > DEFAULT_RANGE.end) {
        return;
      }

      setIpStatuses((previous) => {
        const next = new Map(previous);
        next.set(host, {
          ip: payload.ip,
          status: payload.status,
          responseTime: payload.responseTime,
          openPorts: payload.openPorts,
          scannedPorts: payload.scannedPorts,
          lastUpdated: Date.now(),
        });
        return next;
      });

      setSelectedHost((current) => current ?? host);
    });

    const unlistenComplete = listen<ScanCompleteEvent>(EVENTS.SCAN_COMPLETE, ({ payload }) => {
      setIsScanning(false);
      setScanDuration(payload.duration);
    });

    const unlistenError = listen<ScanErrorEvent>(EVENTS.SCAN_ERROR, ({ payload }) => {
      setError(payload.error);
      setIsScanning(false);
    });

    return () => {
      isMounted = false;
      Promise.all([unlistenHostResult, unlistenComplete, unlistenError]).then((handlers) => {
        handlers.forEach((unlisten) => unlisten());
      });
    };
  }, []);

  const handleNetworkSegmentChange = (value: string) => {
    setScanConfig((previous) => ({
      ...previous,
      networkSegment: value,
      hostStart: DEFAULT_CONFIG.hostStart,
      hostEnd: DEFAULT_CONFIG.hostEnd,
      portsInput: DEFAULT_CONFIG.portsInput,
    }));

    setIpStatuses(createInitialHostStatuses(value));
    setSelectedHost(DEFAULT_RANGE.start);
    setScanDuration(0);
  };

  const prepareForScan = (mode: ScanMode, nextRange: { start: number; end: number }) => {
    const nextConfig = {
      ...scanConfig,
      hostStart: DEFAULT_CONFIG.hostStart,
      hostEnd: DEFAULT_CONFIG.hostEnd,
      portsInput: DEFAULT_CONFIG.portsInput,
    };

    setScanMode(mode);
    setError(null);
    setIsScanning(true);
    setScanDuration(0);
    setScanRange(nextRange);
    setSelectedHost(nextRange.start);
    setIpStatuses(createInitialHostStatuses(scanConfig.networkSegment, nextRange));
    saveConfig(nextConfig);
  };

  const resetAfterFailedStart = () => {
    setIsScanning(false);
    setIpStatuses(createInitialHostStatuses(scanConfig.networkSegment));
    setScanRange(DEFAULT_RANGE);
  };

  const handleStartIpScan = async () => {
    setScanMode('ip');

    if (networkSegmentError) {
      setError('请先修正网段输入。');
      return;
    }

    prepareForScan('ip', DEFAULT_RANGE);

    try {
      await invoke('start_ip_scan', {
        networkSegment: scanConfig.networkSegment,
        hostStart: DEFAULT_RANGE.start,
        hostEnd: DEFAULT_RANGE.end,
      });
    } catch (invokeError) {
      setError(String(invokeError));
      resetAfterFailedStart();
    }
  };

  const handleStartPortScan = () => {
    setIsPortScannerModalOpen(true);
  };

  const handleHostDoubleClick = async (host: number) => {
    const targetIp = `${scanConfig.networkSegment}.${host}`;
    setSelectedHost(host);

    try {
      await invoke('open_ping_in_terminal', {
        host: targetIp,
      });
    } catch (invokeError) {
      setError(String(invokeError));
    }
  };

  const handleStopScan = async () => {
    try {
      await invoke('stop_scan');
    } catch (invokeError) {
      setError(String(invokeError));
    }
  };

  return (
    <div className="app">
      <header className="hero panel">
        <div className="hero-copy">
          <div className="hero-title-row">
            <h1>运维工具</h1>
            <div className="hero-meta">
              <button
                type="button"
                className="hero-badge hero-action-btn"
                onClick={() => setIsAuthenticatorModalOpen(true)}
              >
                <span>工具扩展</span>
                <strong>双因子认证</strong>
              </button>
              <button
                type="button"
                className="hero-badge hero-action-btn"
                onClick={() => setIsPortScannerModalOpen(true)}
              >
                <span>网络检测</span>
                <strong>端口探测</strong>
              </button>
              <button
                type="button"
                className="hero-badge hero-action-btn"
                onClick={() => setIsPingModalOpen(true)}
              >
                <span>网络检测</span>
                <strong>Ping 工具</strong>
              </button>
              <button
                type="button"
                className="hero-badge hero-action-btn"
                onClick={() => setIsSubnetModalOpen(true)}
              >
                <span>网络工具</span>
                <strong>IPv4 子网划分</strong>
              </button>
              <button
                type="button"
                className="hero-badge hero-action-btn"
                onClick={() => setIsPasswordModalOpen(true)}
              >
                <span>工具扩展</span>
                <strong>密码生成器</strong>
              </button>
            </div>
          </div>
        </div>
      </header>

      <ErrorMessage error={error} onDismiss={() => setError(null)} />
      <PortScannerModal
        isOpen={isPortScannerModalOpen}
        onClose={() => setIsPortScannerModalOpen(false)}
        selectedTargetIp={selectedTargetIp}
      />
      <PingToolModal
        isOpen={isPingModalOpen}
        onClose={() => setIsPingModalOpen(false)}
        selectedTargetIp={selectedTargetIp}
      />
      <IPv4SubnettingModal
        isOpen={isSubnetModalOpen}
        onClose={() => setIsSubnetModalOpen(false)}
      />
      <AuthenticatorModal
        isOpen={isAuthenticatorModalOpen}
        onClose={() => setIsAuthenticatorModalOpen(false)}
      />
      <PasswordGeneratorModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />

      <div className="dashboard-layout">
        <div className="results-layout">
          <section className="panel grid-panel">
            <div className="grid-toolbar">
              <div className="grid-network-control">
                <label htmlFor="grid-network-segment">网段</label>
                <input
                  id="grid-network-segment"
                  type="text"
                  value={scanConfig.networkSegment}
                  onChange={(event) => handleNetworkSegmentChange(event.target.value)}
                  disabled={isScanning}
                  placeholder="例如 192.168.1"
                  className={networkSegmentError ? 'error' : ''}
                />
                <div className="grid-toolbar-actions">
                  <button
                    type="button"
                    onClick={handleStartIpScan}
                    disabled={isScanning}
                    className={`btn ${scanMode === 'ip' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    扫描 IP
                  </button>
                  <button
                    type="button"
                    onClick={handleStartPortScan}
                    disabled={isScanning || !selectedTargetIp}
                    className={`btn ${scanMode === 'port' ? 'btn-primary' : 'btn-secondary'}`}
                  >
                    扫描端口
                  </button>
                  <button
                    type="button"
                    onClick={handleStopScan}
                    disabled={!isScanning}
                    className="btn btn-secondary"
                  >
                    停止扫描
                  </button>
                </div>
                <div className="grid-toolbar-selection" aria-live="polite">
                  <span>选中 IP：</span>
                  <strong>{selectedTargetIp ?? '未选择'}</strong>
                </div>
              </div>
              <p className={`grid-toolbar-note ${networkSegmentError ? 'is-error' : ''}`}>
                {toolbarHint}
              </p>
            </div>

            <IpGrid
              networkSegment={scanConfig.networkSegment}
              ipStatuses={ipStatuses}
              previewRange={previewRange}
              selectedHost={selectedHost}
              onSelectHost={setSelectedHost}
              onDoubleClickHost={handleHostDoubleClick}
            />
          </section>
        </div>
      </div>

      <ScanStatusBar
        scanMode={scanMode}
        isScanning={isScanning}
        rangeLabel={statusTargetLabel}
        totalHosts={totalHosts}
        scannedHostCount={scannedHostCount}
        activeHostCount={activeHostCount}
        openPortCount={openPortCount}
        scanDuration={scanDuration}
        localIp={localIp}
      />
    </div>
  );
}

export default App;
