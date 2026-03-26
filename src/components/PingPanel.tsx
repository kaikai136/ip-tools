import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useState } from 'react';

import { PingCommandResult } from '../types';

interface PingPanelProps {
  selectedTargetIp: string | null;
}

const PING_COUNT_OPTIONS = [1, 4, 8, 16] as const;

function formatPingLine(result: PingCommandResult) {
  if (result.status === 'online') {
    return `Reply from ${result.ip}: time=${result.responseTime ?? 0} ms`;
  }

  return 'Request timed out';
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function PingPanel({ selectedTargetIp }: PingPanelProps) {
  const [host, setHost] = useState(selectedTargetIp ?? '');
  const [count, setCount] = useState<number>(4);
  const [isPinging, setIsPinging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  useEffect(() => {
    setHost((current) => {
      if (current.trim()) {
        return current;
      }

      return selectedTargetIp ?? '';
    });
  }, [selectedTargetIp]);

  const handleStartPing = async () => {
    const target = host.trim();
    if (!target) {
      setError('请先输入要 Ping 的主机。');
      return;
    }

    setError(null);
    setLogs([]);
    setSummary(null);
    setIsPinging(true);

    let successCount = 0;
    let timeoutCount = 0;
    let totalResponseTime = 0;

    try {
      for (let index = 0; index < count; index += 1) {
        const result = await invoke<PingCommandResult>('ping_host', { host: target });
        setLogs((previous) => [...previous, formatPingLine(result)]);

        if (result.status === 'online') {
          successCount += 1;
          totalResponseTime += result.responseTime ?? 0;
        } else {
          timeoutCount += 1;
        }

        if (index < count - 1) {
          await wait(220);
        }
      }

      const average = successCount ? Math.round(totalResponseTime / successCount) : null;
      setSummary(
        average === null
          ? `共 ${count} 次，请求全部超时`
          : `共 ${count} 次，成功 ${successCount} 次，超时 ${timeoutCount} 次，平均 ${average} ms`,
      );
    } catch (invokeError) {
      setError(String(invokeError));
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <section className="panel ping-panel">
      <div className="section-head ping-head">
        <div>
          <h2>Ping 工具</h2>
        </div>
      </div>

      <div className="ping-controls">
        <div className="field ping-host-field">
          <input
            id="ping-host"
            type="text"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="输入主机 IP 或域名"
            aria-label="Ping host"
            disabled={isPinging}
          />
        </div>

        <div className="field ping-count-field">
          <select
            id="ping-count"
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
            aria-label="Ping count"
            disabled={isPinging}
          >
            {PING_COUNT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ping-actions">
        <button
          type="button"
          className="btn btn-secondary ping-fill-btn"
          onClick={() => selectedTargetIp && setHost(selectedTargetIp)}
          disabled={isPinging || !selectedTargetIp}
        >
          使用选中 IP
        </button>
        <button type="button" className="btn btn-primary" onClick={handleStartPing} disabled={isPinging}>
          {isPinging ? 'Ping 中...' : '开始 Ping'}
        </button>
      </div>

      {error ? <p className="ping-error">{error}</p> : null}
      {summary ? <p className="ping-summary">{summary}</p> : null}

      <div className="ping-log">
        {logs.length ? (
          logs.map((line, index) => (
            <div key={`${line}-${index}`} className="ping-log-line">
              {line}
            </div>
          ))
        ) : (
          <p className="ping-empty">结果会显示在这里。</p>
        )}
      </div>
    </section>
  );
}
