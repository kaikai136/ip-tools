import { save } from '@tauri-apps/api/dialog';
import { dirname, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/tauri';
import { useEffect, useState } from 'react';

import { PasswordRecord } from '../types';
import {
  loadLastExportPath,
  loadPasswordHistory,
  saveLastExportPath,
  savePasswordHistory,
} from '../utils/storage';

interface PasswordGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HISTORY_LIMIT = 16;
const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const NUMBER_CHARS = '23456789';
const SYMBOL_CHARS = '!@#$%^&*_-+=?';

function formatExportTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function buildExportFileName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];

  return `password-history-${parts.join('')}.txt`;
}

async function buildDefaultSavePath() {
  const lastExportPath = loadLastExportPath();
  const nextFileName = buildExportFileName();

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

function formatProjectName(projectName: string) {
  const trimmed = projectName.trim();
  return trimmed || '未填写项目名称';
}

function randomIndex(max: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % max;
}

function pickCharacter(characters: string) {
  return characters[randomIndex(characters.length)];
}

function shuffleCharacters(characters: string[]) {
  const next = [...characters];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function clampLength(length: number) {
  if (Number.isNaN(length)) {
    return 16;
  }

  return Math.min(64, Math.max(6, length));
}

function formatRecordTime(timestamp: number) {
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeRule(record: Pick<
  PasswordRecord,
  'length' | 'includeUppercase' | 'includeLowercase' | 'includeNumbers' | 'includeSymbols'
>) {
  const labels: string[] = [];

  if (record.includeUppercase) {
    labels.push('大写');
  }

  if (record.includeLowercase) {
    labels.push('小写');
  }

  if (record.includeNumbers) {
    labels.push('数字');
  }

  if (record.includeSymbols) {
    labels.push('符号');
  }

  return `${record.length} 位 · ${labels.join(' / ')}`;
}

function buildExportContent(password: string, currentProjectName: string, history: PasswordRecord[]) {
  const lines = [
    '密码生成器导出',
    `导出时间: ${formatExportTime(Date.now())}`,
    '',
  ];

  if (password) {
    lines.push('当前结果');
    lines.push(`项目名称: ${formatProjectName(currentProjectName)}`);
    lines.push(password);
    lines.push('');
  }

  if (history.length) {
    lines.push('生成记录');

    history.forEach((record, index) => {
      lines.push(`[${index + 1}] ${record.password}`);
      lines.push(`项目名称: ${formatProjectName(record.projectName)}`);
      lines.push(`规则: ${describeRule(record)}`);
      lines.push(`时间: ${formatRecordTime(record.createdAt)}`);
      lines.push('');
    });
  }

  return lines.join('\r\n').trim();
}

function createPasswordRecord(
  projectName: string,
  length: number,
  includeUppercase: boolean,
  includeLowercase: boolean,
  includeNumbers: boolean,
  includeSymbols: boolean,
) {
  const groups = [
    includeUppercase ? UPPERCASE_CHARS : '',
    includeLowercase ? LOWERCASE_CHARS : '',
    includeNumbers ? NUMBER_CHARS : '',
    includeSymbols ? SYMBOL_CHARS : '',
  ].filter(Boolean);

  if (!groups.length) {
    return null;
  }

  const normalizedLength = Math.max(length, groups.length);
  const fullPool = groups.join('');
  const passwordCharacters = groups.map((group) => pickCharacter(group));

  while (passwordCharacters.length < normalizedLength) {
    passwordCharacters.push(pickCharacter(fullPool));
  }

  const password = shuffleCharacters(passwordCharacters).join('');

  return {
    id: crypto.randomUUID(),
    projectName: projectName.trim(),
    password,
    length: normalizedLength,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
    createdAt: Date.now(),
  } satisfies PasswordRecord;
}

export function PasswordGeneratorModal({ isOpen, onClose }: PasswordGeneratorModalProps) {
  const [length, setLength] = useState(16);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [includeLowercase, setIncludeLowercase] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [password, setPassword] = useState('');
  const [history, setHistory] = useState<PasswordRecord[]>(() => loadPasswordHistory());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    savePasswordHistory(history);
  }, [history]);

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

  useEffect(() => {
    if (isOpen && !password && history.length) {
      setPassword(history[0].password);
      setProjectName(history[0].projectName);
    }
  }, [history, isOpen, password]);

  if (!isOpen) {
    return null;
  }

  const activeOptionCount = [
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
  ].filter(Boolean).length;

  const handleGenerate = () => {
    if (!activeOptionCount) {
      setError('至少选择一种字符类型。');
      setMessage(null);
      return;
    }

    const record = createPasswordRecord(
      projectName,
      clampLength(length),
      includeUppercase,
      includeLowercase,
      includeNumbers,
      includeSymbols,
    );

    if (!record) {
      setError('生成失败，请调整参数后重试。');
      setMessage(null);
      return;
    }

    setPassword(record.password);
    setProjectName(record.projectName);
    setHistory((previous) => [record, ...previous].slice(0, HISTORY_LIMIT));
    setError(null);
    setMessage('已生成新密码。');
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMessage('已复制到剪贴板。');
      setError(null);
    } catch (copyError) {
      console.error('Failed to copy password:', copyError);
      setError('复制失败，请手动复制。');
      setMessage(null);
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
    setMessage('记录已清空。');
    setError(null);
  };

  const handleDeleteHistoryItem = (recordId: string) => {
    setHistory((previous) => previous.filter((record) => record.id !== recordId));
    setMessage('已删除该条记录。');
    setError(null);
  };

  const handleSaveAsTxt = async () => {
    if (!password && !history.length) {
      setError('还没有可保存的密码内容。');
      setMessage(null);
      return;
    }

    setIsSaving(true);

    try {
      const selectedPath = await save({
        title: '保存密码记录',
        filters: [
          {
            name: 'Text',
            extensions: ['txt'],
          },
        ],
        defaultPath: await buildDefaultSavePath(),
      });

      if (!selectedPath) {
        setMessage(null);
        setError(null);
        return;
      }

      const finalPath = ensureTxtExtension(selectedPath);

      const savedPath = await invoke<string>('write_text_file', {
        filePath: finalPath,
        content: buildExportContent(password, projectName, history),
      });

      saveLastExportPath(savedPath);
      setMessage(`已保存到 ${savedPath}`);
      setError(null);
    } catch (saveError) {
      console.error('Failed to save password txt:', saveError);
      setError('保存失败，请重试。');
      setMessage(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="password-modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    }}>
      <section className="password-modal panel" role="dialog" aria-modal="true" aria-label="密码生成器">
        <div className="password-modal-head">
          <div>
            <h2>密码生成器</h2>
            <p>点击保存图标后可选择存储路径，默认会打开上次保存的位置。</p>
          </div>
          <div className="password-modal-head-actions">
            <button
              type="button"
              className="password-modal-save"
              onClick={handleSaveAsTxt}
              disabled={isSaving || (!password && !history.length)}
              aria-label="保存到本地 TXT"
              title="选择存储路径并保存为 TXT"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="password-modal-save-icon"
              >
                <path
                  d="M6 3h9l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 2v5h8V5H7Zm0 9v5h10v-7H7v2Zm2 1h6v3H9v-3Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button type="button" className="password-modal-close" onClick={onClose} aria-label="关闭密码生成器">
              ×
            </button>
          </div>
        </div>

        <div className="password-modal-body">
          <div className="password-modal-main">
            <div className="password-length-row">
              <div className="password-length-copy">
                <span className="password-field-label">密码长度</span>
                <strong>{clampLength(length)} 位</strong>
              </div>
              <input
                type="range"
                min={6}
                max={64}
                value={length}
                onChange={(event) => setLength(clampLength(Number(event.target.value)))}
                className="password-length-slider"
                aria-label="密码长度"
              />
            </div>

            <div className="password-option-grid">
              <label className={`password-toggle ${includeUppercase ? 'is-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeUppercase}
                  onChange={(event) => setIncludeUppercase(event.target.checked)}
                />
                大写字母
              </label>
              <label className={`password-toggle ${includeLowercase ? 'is-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeLowercase}
                  onChange={(event) => setIncludeLowercase(event.target.checked)}
                />
                小写字母
              </label>
              <label className={`password-toggle ${includeNumbers ? 'is-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeNumbers}
                  onChange={(event) => setIncludeNumbers(event.target.checked)}
                />
                数字
              </label>
              <label className={`password-toggle ${includeSymbols ? 'is-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={includeSymbols}
                  onChange={(event) => setIncludeSymbols(event.target.checked)}
                />
                符号
              </label>
            </div>

            <div className="password-output-card">
              <div className="password-output-head">
                <span className="password-field-label">密码信息</span>
                <button
                  type="button"
                  className="password-text-btn"
                  onClick={() => handleCopy(password)}
                  disabled={!password}
                >
                  复制
                </button>
              </div>
              <div className="password-output-layout">
                <label className="password-project-panel">
                  <span className="password-field-label">项目名称</span>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="例如 官网后台 / 数据库 / 服务器"
                    aria-label="项目名称"
                  />
                </label>

                <div className="password-result-panel">
                  <span className="password-field-label">生成结果</span>
                  <div className={`password-output ${password ? '' : 'is-empty'}`}>
                    {password || '点击下方按钮生成随机密码'}
                  </div>
                </div>
              </div>
            </div>

            <div className="password-actions">
              <button type="button" className="btn btn-primary" onClick={handleGenerate}>
                生成密码
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleClearHistory}
                disabled={!history.length}
              >
                清空记录
              </button>
            </div>

            {message ? <p className="password-feedback">{message}</p> : null}
            {error ? <p className="password-error">{error}</p> : null}
          </div>

          <div className="password-history-card">
            <div className="password-history-head">
              <span className="password-field-label">生成记录</span>
              <span className="password-history-count">{history.length} 条</span>
            </div>

            <div className="password-history-list">
              {history.length ? (
                history.map((record) => (
                  <div key={record.id} className="password-history-item">
                    <div className="password-history-copy">
                      <strong>{record.password}</strong>
                      <span className="password-history-project">
                        项目：{formatProjectName(record.projectName)}
                      </span>
                      <span>{describeRule(record)}</span>
                      <span>{formatRecordTime(record.createdAt)}</span>
                    </div>
                    <div className="password-history-actions">
                    <button
                      type="button"
                      className="password-history-copy-btn"
                      onClick={() => handleCopy(record.password)}
                    >
                      复制
                    </button>
                      <button
                        type="button"
                        className="password-history-delete-btn"
                        onClick={() => handleDeleteHistoryItem(record.id)}
                        aria-label="删除该条记录"
                        title="删除"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="password-history-empty">还没有生成记录。</p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
