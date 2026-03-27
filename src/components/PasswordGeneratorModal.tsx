import { useEffect, useState } from 'react';

import { PasswordRecord } from '../types';
import { loadPasswordHistory, savePasswordHistory } from '../utils/storage';

interface PasswordGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const HISTORY_LIMIT = 16;
const UPPERCASE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE_CHARS = 'abcdefghijkmnopqrstuvwxyz';
const NUMBER_CHARS = '23456789';
const SYMBOL_CHARS = '!@#$%^&*_-+=?';

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

function createPasswordRecord(
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
  const [password, setPassword] = useState('');
  const [history, setHistory] = useState<PasswordRecord[]>(() => loadPasswordHistory());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
            <p>点击生成随机密码，记录会保存在当前设备。</p>
          </div>
          <button type="button" className="password-modal-close" onClick={onClose} aria-label="关闭密码生成器">
            ×
          </button>
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
                <span className="password-field-label">当前结果</span>
                <button
                  type="button"
                  className="password-text-btn"
                  onClick={() => handleCopy(password)}
                  disabled={!password}
                >
                  复制
                </button>
              </div>
              <div className={`password-output ${password ? '' : 'is-empty'}`}>
                {password || '点击下方按钮生成随机密码'}
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
                      <span>{describeRule(record)}</span>
                      <span>{formatRecordTime(record.createdAt)}</span>
                    </div>
                    <button
                      type="button"
                      className="password-history-copy-btn"
                      onClick={() => handleCopy(record.password)}
                    >
                      复制
                    </button>
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
