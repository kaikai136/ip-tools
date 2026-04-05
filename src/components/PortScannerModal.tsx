import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useMemo, useState } from 'react';

import {
  EVENTS,
  PortQuickTestResult,
  PortToolProgressEvent,
  PortToolScanResult,
} from '../types';
import { parsePortsInput, validatePortsInput } from '../utils/validation';

interface PortScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTargetIp: string | null;
}

interface PortScanProgressState {
  scannedPorts: number;
  totalPorts: number;
  openPorts: number;
}

const PORT_PRESETS = [
  { label: '常用端口', value: '21,22,80,135,139,443,445,3389' },
  { label: '1-100', value: '1-100' },
  { label: '1-1024', value: '1-1024' },
  { label: '全端口', value: '1-65535' },
  { label: '数据库', value: '1433,1521,3306,5432,6379,27017' },
  { label: 'Web 服务', value: '80,81,88,443,8000-8080,8443' },
] as const;

function parsePositiveInt(value: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value.trim(), 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function formatDuration(duration: number) {
  return `${duration} ms`;
}

export function PortScannerModal({
  isOpen,
  onClose,
  selectedTargetIp,
}: PortScannerModalProps) {
  const [targetHost, setTargetHost] = useState('');
  const [portsInput, setPortsInput] = useState('1-1024');
  const [timeoutInput, setTimeoutInput] = useState('2000');
  const [concurrencyInput, setConcurrencyInput] = useState('50');
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanMessage, setScanMessage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<PortToolScanResult | null>(null);
  const [scanProgress, setScanProgress] = useState<PortScanProgressState | null>(null);
  const [quickHost, setQuickHost] = useState('');
  const [quickPortInput, setQuickPortInput] = useState('80');
  const [isQuickTesting, setIsQuickTesting] = useState(false);
  const [quickResult, setQuickResult] = useState<PortQuickTestResult | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void handleRequestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isScanning]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const defaultHost = selectedTargetIp ?? '127.0.0.1';
    setTargetHost((current) => (current.trim() ? current : defaultHost));
    setQuickHost((current) => (current.trim() ? current : defaultHost));
  }, [isOpen, selectedTargetIp]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    let unlistenComplete: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;
    let unlistenProgress: (() => void) | undefined;

    void (async () => {
      unlistenProgress = await listen<PortToolProgressEvent>(
        EVENTS.PORT_TOOL_PROGRESS,
        ({ payload }) => {
          setScanProgress({
            scannedPorts: payload.scannedPorts,
            totalPorts: payload.totalPorts,
            openPorts: payload.openPorts,
          });
          setScanMessage(
            `正在扫描 ${payload.host}，已完成 ${payload.scannedPorts}/${payload.totalPorts}，发现 ${payload.openPorts} 个开放端口。`,
          );
        },
      );

      unlistenComplete = await listen<PortToolScanResult>(
        EVENTS.PORT_TOOL_COMPLETE,
        ({ payload }) => {
          setIsScanning(false);
          setScanResult(payload);
          setScanMessage(
            `扫描完成，共发现 ${payload.openPorts.length} 个开放端口，耗时 ${formatDuration(payload.duration)}。`,
          );
        },
      );

      unlistenError = await listen<{ error: string }>(
        EVENTS.PORT_TOOL_ERROR,
        ({ payload }) => {
          setIsScanning(false);
          setScanError(payload.error);
          setScanMessage(null);
        },
      );
    })();

    return () => {
      void Promise.all([unlistenComplete, unlistenError, unlistenProgress].filter(Boolean)).then(
        (handlers) => {
          handlers.forEach((unlisten) => unlisten?.());
        },
      );
    };
  }, [isOpen]);

  const portsError = validatePortsInput(portsInput);
  const portPreviewCount = useMemo(() => {
    if (portsError) {
      return null;
    }

    try {
      return parsePortsInput(portsInput).length;
    } catch {
      return null;
    }
  }, [portsError, portsInput]);

  const timeoutMs = parsePositiveInt(timeoutInput, 2000, 100, 60000);
  const concurrency = parsePositiveInt(concurrencyInput, 50, 1, 512);
  const quickPort = parsePositiveInt(quickPortInput, 80, 1, 65535);
  const progressPercent = scanProgress
    ? Math.round((scanProgress.scannedPorts / Math.max(scanProgress.totalPorts, 1)) * 100)
    : 0;

  const handleUseSelectedIp = () => {
    if (selectedTargetIp) {
      setTargetHost(selectedTargetIp);
      setQuickHost(selectedTargetIp);
    }
  };

  const handleRequestClose = async () => {
    if (isScanning) {
      try {
        await invoke('stop_scan');
      } catch (error) {
        console.error('Failed to stop port tool scan before closing:', error);
      }
    }

    onClose();
  };

  const handleStartScan = async () => {
    const host = targetHost.trim();
    if (!host) {
      setScanError('请先输入目标主机。');
      return;
    }

    if (portsError) {
      setScanError(portsError);
      return;
    }

    setIsScanning(true);
    setScanError(null);
    setScanMessage('正在启动端口扫描…');
    setScanResult(null);
    setScanProgress(null);

    try {
      await invoke('start_port_tool_scan', {
        host,
        portsInput,
        timeoutMs,
        concurrency,
      });
    } catch (error) {
      setIsScanning(false);
      setScanError(String(error));
      setScanMessage(null);
    }
  };

  const handleStopScan = async () => {
    try {
      await invoke('stop_scan');
      setIsScanning(false);
      setScanMessage('已请求停止当前扫描。');
    } catch (error) {
      setScanError(String(error));
    }
  };

  const handleQuickTest = async () => {
    const host = quickHost.trim();
    if (!host) {
      setQuickError('请先输入要测试的目标主机。');
      return;
    }

    setIsQuickTesting(true);
    setQuickError(null);
    setQuickResult(null);

    try {
      const result = await invoke<PortQuickTestResult>('quick_port_test', {
        host,
        port: quickPort,
        timeoutMs,
      });
      setQuickResult(result);
    } catch (error) {
      setQuickError(String(error));
    } finally {
      setIsQuickTesting(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="tool-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          void handleRequestClose();
        }
      }}
    >
      <section
        className="port-tool-modal panel"
        role="dialog"
        aria-modal="true"
        aria-label="端口探测工具"
      >
        <div className="port-tool-modal-head">
          <div>
            <h2>端口探测工具</h2>
            <p>支持目标主机端口扫描，以及单端口快速探测。</p>
          </div>
          <button
            type="button"
            className="port-tool-modal-close"
            onClick={() => {
              void handleRequestClose();
            }}
            aria-label="关闭端口探测工具"
          >
            ×
          </button>
        </div>

        <div className="port-tool-modal-body">
          <div className="port-tool-layout">
            <section className="port-scan-card">
              <div className="port-section-head port-section-head-scan">
                <div className="port-section-title-row">
                  <h3>扫描配置</h3>
                  <span>仅支持 TCP</span>
                </div>

                <div className="port-scan-summary">
                  <span className="port-count-hint">
                    {portPreviewCount === null
                      ? '请先修正端口范围。'
                      : `当前共 ${portPreviewCount} 个端口。`}
                  </span>
                  {!scanError && scanMessage ? <p className="port-message">{scanMessage}</p> : null}
                </div>

                <button
                  type="button"
                  className="port-selected-btn"
                  onClick={handleUseSelectedIp}
                  disabled={!selectedTargetIp || isScanning}
                >
                  使用选中 IP
                </button>
              </div>

              <label className="port-field port-field-full">
                <span>目标主机</span>
                <input
                  type="text"
                  value={targetHost}
                  onChange={(event) => setTargetHost(event.target.value)}
                  placeholder="如 127.0.0.1 或 example.com"
                  disabled={isScanning}
                />
              </label>

              <div className="port-config-grid">
                <label className="port-field">
                  <span>端口范围</span>
                  <input
                    type="text"
                    value={portsInput}
                    onChange={(event) => setPortsInput(event.target.value)}
                    placeholder="如 80,443,8080 或 1-1000"
                    disabled={isScanning}
                  />
                </label>

                <label className="port-field">
                  <span>超时 (ms)</span>
                  <input
                    type="number"
                    min={100}
                    max={60000}
                    value={timeoutInput}
                    onChange={(event) => setTimeoutInput(event.target.value)}
                    disabled={isScanning}
                  />
                </label>

                <label className="port-field">
                  <span>并发数</span>
                  <input
                    type="number"
                    min={1}
                    max={512}
                    value={concurrencyInput}
                    onChange={(event) => setConcurrencyInput(event.target.value)}
                    disabled={isScanning}
                  />
                </label>
              </div>

              <div className="port-preset-row">
                {PORT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="port-preset-chip"
                    onClick={() => setPortsInput(preset.value)}
                    disabled={isScanning}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="port-action-row">
                <button
                  type="button"
                  className="port-start-btn"
                  onClick={() => {
                    void handleStartScan();
                  }}
                  disabled={isScanning}
                >
                  开始扫描
                </button>
                <button
                  type="button"
                  className="port-stop-btn"
                  onClick={() => {
                    void handleStopScan();
                  }}
                  disabled={!isScanning}
                >
                  停止
                </button>
              </div>

              {scanError ? <p className="port-error">{scanError}</p> : null}

              {scanProgress ? (
                <div className="port-progress-row">
                  <div className="port-progress-meta">
                    <span>扫描进度</span>
                    <strong>{progressPercent}%</strong>
                  </div>
                  <div className="port-progress-track">
                    <div
                      className={`port-progress-bar ${isScanning ? 'is-active' : ''}`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="port-progress-copy">
                    <span>
                      已扫描 {scanProgress.scannedPorts} / {scanProgress.totalPorts}
                    </span>
                    <span>开放端口 {scanProgress.openPorts}</span>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="port-quick-card">
              <div className="port-section-head">
                <div className="port-section-title-row">
                  <h3>单端口快速测试</h3>
                  <span>适合单点验证</span>
                </div>
              </div>

              <div className="port-quick-grid">
                <label className="port-field">
                  <span>目标主机</span>
                  <input
                    type="text"
                    value={quickHost}
                    onChange={(event) => setQuickHost(event.target.value)}
                    placeholder="如 127.0.0.1"
                    disabled={isQuickTesting}
                  />
                </label>

                <label className="port-field">
                  <span>端口</span>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={quickPortInput}
                    onChange={(event) => setQuickPortInput(event.target.value)}
                    disabled={isQuickTesting}
                  />
                </label>

                <button
                  type="button"
                  className="port-quick-btn"
                  onClick={() => {
                    void handleQuickTest();
                  }}
                  disabled={isQuickTesting}
                >
                  快速测试
                </button>
              </div>

              {quickError ? <p className="port-error">{quickError}</p> : null}

              {quickResult ? (
                <div className={`port-quick-result ${quickResult.isOpen ? 'is-open' : 'is-closed'}`}>
                  <strong>{quickResult.host}</strong>
                  <span>{quickResult.port}</span>
                  <em>{quickResult.isOpen ? '端口开放' : '端口关闭'}</em>
                  <span>{formatDuration(quickResult.duration)}</span>
                </div>
              ) : null}
            </section>

            <section className="port-result-card">
              <div className="port-section-head">
                <div className="port-section-title-row">
                  <h3>扫描结果</h3>
                </div>
              </div>

              {scanResult ? (
                <>
                  <div className="port-summary-grid">
                    <div className="port-summary-item">
                      <span>目标主机</span>
                      <strong>{scanResult.host}</strong>
                    </div>
                    <div className="port-summary-item">
                      <span>已扫描端口</span>
                      <strong>{scanResult.scannedPorts}</strong>
                    </div>
                    <div className="port-summary-item">
                      <span>耗时</span>
                      <strong>{formatDuration(scanResult.duration)}</strong>
                    </div>
                  </div>

                  <div className="port-open-section">
                    <div className="port-open-head">
                      <span>开放端口</span>
                      <span className="port-result-badge">{scanResult.openPorts.length} 个</span>
                    </div>
                    {scanResult.openPorts.length ? (
                      <div className="port-open-list">
                        {scanResult.openPorts.map((port) => (
                          <span key={port} className="port-open-chip">
                            {port}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="port-result-empty">本次扫描未发现开放端口。</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="port-result-empty">开始扫描后，这里会展示端口结果汇总。</p>
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
