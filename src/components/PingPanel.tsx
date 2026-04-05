import { save } from '@tauri-apps/api/dialog';
import { dirname, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useRef, useState } from 'react';

import { PingCommandResult, PingHistoryRecord } from '../types';
import {
  loadLastExportPath,
  loadPingHistory,
  saveLastExportPath,
  savePingHistory,
} from '../utils/storage';

interface PingPanelProps {
  selectedTargetIp: string | null;
  variant?: 'sidebar' | 'modal';
}

interface PingDetailEntry {
  id: string;
  sequence: number;
  target: string;
  status: PingCommandResult['status'];
  responseTime: number | null;
  timestamp: number;
}

interface PingMetrics {
  successCount: number;
  failureCount: number;
  lossRate: number;
  averageResponseTime: number | null;
  minResponseTime: number | null;
  maxResponseTime: number | null;
  jitter: number | null;
  totalCount: number;
}

const PING_TARGET_PRESETS = [
  { label: '阿里DNS', value: '223.5.5.5' },
  { label: '腾讯DNS', value: '119.29.29.29' },
  { label: '114DNS', value: '114.114.114.114' },
  { label: 'Google DNS', value: '8.8.8.8' },
  { label: '百度', value: 'www.baidu.com' },
] as const;

const HISTORY_LIMIT = 20;
const CHART_WIDTH = 720;
const CHART_HEIGHT = 170;
const CHART_PADDING_TOP = 14;
const CHART_PADDING_RIGHT = 14;
const CHART_PADDING_BOTTOM = 28;
const CHART_PADDING_LEFT = 40;
const CHART_Y_TICK_COUNT = 4;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function sanitizeExportTarget(target: string) {
  return target
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'ping-result';
}

function buildExportFileName(target: string) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `ping-${sanitizeExportTarget(target)}-${timestamp}.txt`;
}

async function buildDefaultSavePath(target: string) {
  const lastExportPath = loadLastExportPath();
  const nextFileName = buildExportFileName(target);

  if (!lastExportPath) {
    return nextFileName;
  }

  try {
    const parentPath = await dirname(lastExportPath);
    return await join(parentPath, nextFileName);
  } catch (error) {
    console.error('Failed to resolve previous export path:', error);
    return nextFileName;
  }
}

function ensureTxtExtension(filePath: string) {
  return filePath.toLowerCase().endsWith('.txt') ? filePath : `${filePath}.txt`;
}

function parsePositiveInt(value: string, fallback: number, min: number) {
  const parsed = Number.parseInt(value.trim(), 10);

  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(min, parsed);
}

function formatSessionTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMetric(value: number | null, suffix = ' ms') {
  return value === null ? '--' : `${value}${suffix}`;
}

function getNiceStep(maxValue: number, segments: number) {
  const roughStep = Math.max(maxValue / segments, 1);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function calculatePingMetrics(details: PingDetailEntry[]): PingMetrics {
  const successfulEntries = details.filter(
    (entry) => entry.status === 'online' && entry.responseTime !== null,
  );
  const responseTimes = successfulEntries.map((entry) => entry.responseTime ?? 0);
  const successCount = successfulEntries.length;
  const failureCount = details.length - successCount;
  const totalCount = details.length;
  const lossRate = totalCount ? Math.round((failureCount / totalCount) * 100) : 0;

  if (!responseTimes.length) {
    return {
      successCount,
      failureCount,
      lossRate,
      averageResponseTime: null,
      minResponseTime: null,
      maxResponseTime: null,
      jitter: null,
      totalCount,
    };
  }

  const totalResponseTime = responseTimes.reduce((sum, value) => sum + value, 0);
  const jitterValues = responseTimes
    .slice(1)
    .map((value, index) => Math.abs(value - responseTimes[index]));

  return {
    successCount,
    failureCount,
    lossRate,
    averageResponseTime: Math.round(totalResponseTime / responseTimes.length),
    minResponseTime: Math.min(...responseTimes),
    maxResponseTime: Math.max(...responseTimes),
    jitter: jitterValues.length
      ? Math.round(jitterValues.reduce((sum, value) => sum + value, 0) / jitterValues.length)
      : null,
    totalCount,
  };
}

function createHistoryRecord(target: string, details: PingDetailEntry[]): PingHistoryRecord {
  const metrics = calculatePingMetrics(details);

  return {
    id: crypto.randomUUID(),
    target,
    successCount: metrics.successCount,
    failureCount: metrics.failureCount,
    lossRate: metrics.lossRate,
    averageResponseTime: metrics.averageResponseTime,
    minResponseTime: metrics.minResponseTime,
    maxResponseTime: metrics.maxResponseTime,
    jitter: metrics.jitter,
    totalCount: metrics.totalCount,
    createdAt: Date.now(),
  };
}

function buildExportContent(
  target: string,
  details: PingDetailEntry[],
  metrics: PingMetrics,
  config: {
    count: number;
    timeoutMs: number;
    intervalMs: number;
    continuous: boolean;
  },
) {
  const lines = [
    'Ping 测试导出',
    `目标主机: ${target}`,
    `导出时间: ${new Date().toLocaleString('zh-CN')}`,
    `测试模式: ${config.continuous ? '连续 Ping' : `${config.count} 次`}`,
    `超时: ${config.timeoutMs} ms`,
    `间隔: ${config.intervalMs} ms`,
    '',
    '统计概览',
    `成功: ${metrics.successCount}`,
    `失败: ${metrics.failureCount}`,
    `丢包率: ${metrics.lossRate}%`,
    `平均: ${formatMetric(metrics.averageResponseTime)}`,
    `最小: ${formatMetric(metrics.minResponseTime)}`,
    `最大: ${formatMetric(metrics.maxResponseTime)}`,
    `抖动: ${formatMetric(metrics.jitter)}`,
    `总计: ${metrics.totalCount}`,
    '',
    '详细结果',
  ];

  details.forEach((entry) => {
    lines.push(
      `#${entry.sequence} ${entry.target} | ${
        entry.status === 'online'
          ? `${entry.responseTime ?? 0} ms | 成功`
          : `超时 | 失败`
      } | ${new Date(entry.timestamp).toLocaleTimeString('zh-CN')}`,
    );
  });

  return lines.join('\r\n');
}

function buildChart(entries: PingDetailEntry[], timeoutMs: number) {
  if (!entries.length) {
    return {
      linePoints: '',
      averageLineY: null as number | null,
      points: [] as Array<{
        id: string;
        x: number;
        y: number;
        status: PingDetailEntry['status'];
      }>,
      xTicks: [] as Array<{ key: string; x: number; label: string }>,
      yTicks: [] as Array<{ key: string; y: number; label: string; isBaseline: boolean }>,
      baselineY: CHART_HEIGHT - CHART_PADDING_BOTTOM,
      maxValue: timeoutMs,
    };
  }

  const successfulValues = entries
    .filter((entry) => entry.status === 'online' && entry.responseTime !== null)
    .map((entry) => entry.responseTime ?? 0);
  const hasTimeout = entries.some((entry) => entry.status === 'timeout');
  const responsePeak = successfulValues.length ? Math.max(...successfulValues) : 0;
  const referenceMax = hasTimeout
    ? Math.max(responsePeak, Math.min(timeoutMs, 200))
    : Math.max(responsePeak, 50);
  const stepValue = getNiceStep(Math.max(referenceMax * 1.1, 20), CHART_Y_TICK_COUNT);
  const maxValue = stepValue * CHART_Y_TICK_COUNT;
  const chartInnerWidth = CHART_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT;
  const chartInnerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
  const stepX = entries.length > 1 ? chartInnerWidth / (entries.length - 1) : 0;

  const getY = (value: number) =>
    CHART_PADDING_TOP +
    chartInnerHeight -
    (Math.min(value, maxValue) / maxValue) * chartInnerHeight;

  const points = entries.map((entry, index) => {
    const x = CHART_PADDING_LEFT + index * stepX;
    const plottedValue = entry.status === 'online' ? entry.responseTime ?? 0 : maxValue;

    return {
      id: entry.id,
      x,
      y: getY(plottedValue),
      status: entry.status,
      sequence: entry.sequence,
    };
  });

  const linePoints = points.map((point) => `${point.x},${point.y}`).join(' ');

  const metrics = calculatePingMetrics(entries);
  const yTicks = Array.from({ length: CHART_Y_TICK_COUNT + 1 }, (_, index) => {
    const value = stepValue * (CHART_Y_TICK_COUNT - index);
    return {
      key: `y-${value}`,
      y: getY(value),
      label: String(value),
      isBaseline: value === 0,
    };
  });
  const maxTickLabels = 6;
  const xTickIndexes =
    entries.length <= maxTickLabels
      ? entries.map((_, index) => index)
      : Array.from(
          new Set([
            0,
            ...Array.from({ length: maxTickLabels - 2 }, (_, index) =>
              Math.round(((entries.length - 1) * (index + 1)) / (maxTickLabels - 1)),
            ),
            entries.length - 1,
          ]),
        );
  const xTicks = xTickIndexes.map((index) => ({
    key: `x-${entries[index].id}`,
    x: points[index].x,
    label: `#${entries[index].sequence}`,
  }));

  return {
    linePoints,
    averageLineY:
      metrics.averageResponseTime === null ? null : getY(metrics.averageResponseTime),
    points,
    xTicks,
    yTicks,
    baselineY: CHART_HEIGHT - CHART_PADDING_BOTTOM,
    maxValue,
  };
}

export function PingPanel({ selectedTargetIp, variant = 'sidebar' }: PingPanelProps) {
  const [host, setHost] = useState(selectedTargetIp ?? '');
  const [countInput, setCountInput] = useState('4');
  const [timeoutInput, setTimeoutInput] = useState('3000');
  const [intervalInput, setIntervalInput] = useState('1000');
  const [isContinuous, setIsContinuous] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<PingDetailEntry[]>([]);
  const [history, setHistory] = useState<PingHistoryRecord[]>(() => loadPingHistory());
  const stopRequestedRef = useRef(false);

  useEffect(() => {
    savePingHistory(history);
  }, [history]);

  useEffect(() => {
    setHost((current) => {
      if (current.trim()) {
        return current;
      }

      return selectedTargetIp ?? '';
    });
  }, [selectedTargetIp]);

  const metrics = calculatePingMetrics(details);
  const chart = buildChart(details, parsePositiveInt(timeoutInput, 3000, 100));
  const normalizedCount = parsePositiveInt(countInput, 10, 1);
  const normalizedTimeout = parsePositiveInt(timeoutInput, 3000, 100);
  const normalizedInterval = parsePositiveInt(intervalInput, 1000, 100);

  const handleStartPing = async () => {
    const target = host.trim();
    if (!target) {
      setError('请先输入目标主机。');
      return;
    }

    stopRequestedRef.current = false;
    setIsPinging(true);
    setError(null);
    setDetails([]);

    const sessionDetails: PingDetailEntry[] = [];

    try {
      let sequence = 0;

      while (!stopRequestedRef.current) {
        sequence += 1;

        const result = await invoke<PingCommandResult>('ping_host_with_timeout', {
          host: target,
          timeoutMs: normalizedTimeout,
        });

        const entry: PingDetailEntry = {
          id: crypto.randomUUID(),
          sequence,
          target: result.ip,
          status: result.status,
          responseTime: result.responseTime ?? null,
          timestamp: Date.now(),
        };

        sessionDetails.push(entry);
        setDetails((previous) => [...previous, entry]);

        if (!isContinuous && sequence >= normalizedCount) {
          break;
        }

        if (!stopRequestedRef.current) {
          await wait(normalizedInterval);
        }
      }
    } catch (invokeError) {
      setError(String(invokeError));
    } finally {
      if (sessionDetails.length) {
        setHistory((previous) => [createHistoryRecord(host.trim(), sessionDetails), ...previous].slice(0, HISTORY_LIMIT));
      }

      setIsPinging(false);
      stopRequestedRef.current = false;
    }
  };

  const handleStopPing = () => {
    stopRequestedRef.current = true;
  };

  const handleExport = async () => {
    if (!details.length) {
      setError('还没有可导出的 Ping 结果。');
      return;
    }

    setIsExporting(true);

    try {
      const selectedPath = await save({
        title: '导出 Ping 结果',
        filters: [
          {
            name: 'Text',
            extensions: ['txt'],
          },
        ],
        defaultPath: await buildDefaultSavePath(host.trim()),
      });

      if (!selectedPath) {
        setError(null);
        return;
      }

      const finalPath = ensureTxtExtension(selectedPath);
      const savedPath = await invoke<string>('write_text_file', {
        filePath: finalPath,
        content: buildExportContent(host.trim(), details, metrics, {
          count: normalizedCount,
          timeoutMs: normalizedTimeout,
          intervalMs: normalizedInterval,
          continuous: isContinuous,
        }),
      });

      saveLastExportPath(savedPath);
      setError(null);
    } catch (exportError) {
      console.error('Failed to export ping result:', exportError);
      setError('导出失败，请重试。');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className={`panel ping-panel ${variant === 'modal' ? 'ping-panel-modal' : ''}`}>
      <div className="ping-tool-layout">
        <section className="ping-config-card">
          <div className="ping-section-title">测试配置</div>

          <div className="ping-preset-row">
            {PING_TARGET_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="ping-preset-chip"
                onClick={() => setHost(preset.value)}
                disabled={isPinging}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="ping-config-grid">
            <label className="ping-config-field ping-target-field">
              <span>目标主机</span>
              <input
                type="text"
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="输入 IP 或域名"
                disabled={isPinging}
              />
            </label>

            <label className="ping-config-field">
              <span>次数</span>
              <input
                type="number"
                min={1}
                value={countInput}
                onChange={(event) => setCountInput(event.target.value)}
                disabled={isPinging || isContinuous}
              />
            </label>

            <label className="ping-config-field">
              <span>超时 (ms)</span>
              <input
                type="number"
                min={100}
                step={100}
                value={timeoutInput}
                onChange={(event) => setTimeoutInput(event.target.value)}
                disabled={isPinging}
              />
            </label>

            <label className="ping-config-field">
              <span>间隔 (ms)</span>
              <input
                type="number"
                min={100}
                step={100}
                value={intervalInput}
                onChange={(event) => setIntervalInput(event.target.value)}
                disabled={isPinging}
              />
            </label>
          </div>

          <label className="ping-continuous-toggle">
            <input
              type="checkbox"
              checked={isContinuous}
              onChange={(event) => setIsContinuous(event.target.checked)}
              disabled={isPinging}
            />
            <span>连续 Ping（直到手动停止）</span>
          </label>

          <div className="ping-config-actions">
            <button
              type="button"
              className="ping-start-btn"
              onClick={handleStartPing}
              disabled={isPinging || !host.trim()}
            >
              开始 Ping
            </button>
            <button
              type="button"
              className="ping-action-btn"
              onClick={handleStopPing}
              disabled={!isPinging}
            >
              停止
            </button>
            <button
              type="button"
              className="ping-action-btn"
              onClick={handleExport}
              disabled={!details.length || isExporting}
            >
              导出
            </button>
          </div>

          <div className="ping-config-note-row">
            <button
              type="button"
              className="ping-inline-link"
              onClick={() => selectedTargetIp && setHost(selectedTargetIp)}
              disabled={!selectedTargetIp || isPinging}
            >
              使用选中 IP
            </button>
            {error ? <p className="ping-error">{error}</p> : null}
          </div>
        </section>

        <section className="ping-results-card">
          <div className="ping-section-title">测试结果</div>

          <div className="ping-chart-card">
            <div className="ping-chart-head">
              <span>延迟波形图</span>
              <div className="ping-chart-legend">
                <span className="legend-item"><i className="legend-dot is-line" />延迟</span>
                <span className="legend-item"><i className="legend-dot is-average" />平均</span>
                <span className="legend-item"><i className="legend-dot is-timeout" />超时</span>
              </div>
            </div>

            <div className="ping-chart-wrap">
              {details.length ? (
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="ping-chart-svg" aria-hidden="true">
                  {chart.yTicks.map((tick) => (
                    <g key={tick.key}>
                      <line
                        x1={CHART_PADDING_LEFT}
                        y1={tick.y}
                        x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                        y2={tick.y}
                        className={tick.isBaseline ? 'ping-chart-axis' : 'ping-chart-grid'}
                      />
                      <text
                        x={CHART_PADDING_LEFT - 8}
                        y={tick.y}
                        className="ping-chart-label ping-chart-label-y"
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}
                  {chart.averageLineY !== null ? (
                    <line
                      x1={CHART_PADDING_LEFT}
                      y1={chart.averageLineY}
                      x2={CHART_WIDTH - CHART_PADDING_RIGHT}
                      y2={chart.averageLineY}
                      className="ping-chart-average"
                    />
                  ) : null}
                  <polyline points={chart.linePoints} className="ping-chart-line" />
                  {chart.points.map((point) => (
                    <circle
                      key={point.id}
                      cx={point.x}
                      cy={point.y}
                      r={3.5}
                      className={
                        point.status === 'online'
                          ? 'ping-chart-point'
                          : 'ping-chart-point is-timeout'
                      }
                    />
                  ))}
                  {chart.xTicks.map((tick) => (
                    <g key={tick.key}>
                      <line
                        x1={tick.x}
                        y1={chart.baselineY}
                        x2={tick.x}
                        y2={chart.baselineY + 5}
                        className="ping-chart-axis-tick"
                      />
                      <text
                        x={tick.x}
                        y={chart.baselineY + 17}
                        className="ping-chart-label ping-chart-label-x"
                      >
                        {tick.label}
                      </text>
                    </g>
                  ))}
                </svg>
              ) : (
                <div className="ping-chart-empty">开始测试后，这里会展示延迟波形。</div>
              )}
            </div>
          </div>

          <div className="ping-metric-grid">
            <div className="ping-metric-card is-success">
              <strong>{metrics.successCount}</strong>
              <span>成功</span>
            </div>
            <div className="ping-metric-card is-danger">
              <strong>{metrics.failureCount}</strong>
              <span>失败</span>
            </div>
            <div className="ping-metric-card is-warning">
              <strong>{metrics.totalCount ? `${metrics.lossRate}%` : '0%'}</strong>
              <span>丢包率</span>
            </div>
            <div className="ping-metric-card is-info">
              <strong>{metrics.averageResponseTime ?? '--'}</strong>
              <span>平均 (ms)</span>
            </div>
            <div className="ping-metric-card is-success">
              <strong>{metrics.minResponseTime ?? '--'}</strong>
              <span>最小 (ms)</span>
            </div>
            <div className="ping-metric-card is-danger">
              <strong>{metrics.maxResponseTime ?? '--'}</strong>
              <span>最大 (ms)</span>
            </div>
            <div className="ping-metric-card is-purple">
              <strong>{metrics.jitter ?? '--'}</strong>
              <span>抖动 (ms)</span>
            </div>
            <div className="ping-metric-card">
              <strong>{metrics.totalCount}</strong>
              <span>总计</span>
            </div>
          </div>

          <div className="ping-detail-card">
            <div className="ping-detail-head">
              <span>详细结果</span>
              <button
                type="button"
                className="ping-small-btn"
                onClick={() => setDetails([])}
                disabled={!details.length || isPinging}
              >
                清空
              </button>
            </div>

            <div className="ping-detail-list">
              {details.length ? (
                <div className="ping-detail-table-head">
                  <span>序号</span>
                  <span>目标主机</span>
                  <span>延迟</span>
                  <span>状态</span>
                </div>
              ) : null}
              {details.length ? (
                details.map((entry) => (
                  <div key={entry.id} className="ping-detail-row">
                    <span className="ping-detail-seq">#{entry.sequence}</span>
                    <span className="ping-detail-target">{entry.target}</span>
                    <span className="ping-detail-latency">
                      {entry.status === 'online' ? `${entry.responseTime ?? 0} ms` : '超时'}
                    </span>
                    <span className={`ping-detail-status ${entry.status === 'online' ? 'is-success' : 'is-timeout'}`}>
                      <i />
                      {entry.status === 'online' ? '成功' : '超时'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="ping-detail-empty">还没有测试结果。</div>
              )}
            </div>
          </div>
        </section>

        <section className="ping-history-card">
          <div className="ping-detail-head">
            <span>历史记录</span>
            <button
              type="button"
              className="ping-small-btn"
              onClick={() => setHistory([])}
              disabled={!history.length}
            >
              清空
            </button>
          </div>

          <div className="ping-history-list">
            {history.length ? (
              history.map((record) => (
                <div key={record.id} className="ping-history-row">
                  <span className="ping-history-target">{record.target}</span>
                  <span className="ping-history-summary">
                    成功 {record.successCount}/{record.totalCount} | 平均{' '}
                    {record.averageResponseTime === null ? '--' : `${record.averageResponseTime}ms`} | 丢包{' '}
                    {record.lossRate}%
                  </span>
                  <span className="ping-history-time">{formatSessionTime(record.createdAt)}</span>
                </div>
              ))
            ) : (
              <div className="ping-detail-empty">还没有历史记录。</div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
