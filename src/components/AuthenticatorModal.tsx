import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { save } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api/tauri';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

import { AuthenticatorEntry, TotpAlgorithm } from '../types';
import { loadAuthenticatorEntries, saveAuthenticatorEntries } from '../utils/storage';
import {
  generateTotpCode,
  normalizeBase32Secret,
  normalizeTotpDigits,
  normalizeTotpPeriod,
  parseOtpAuthUri,
  validateTotpSecret,
} from '../utils/totp';

interface AuthenticatorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface EntryDisplayState {
  code: string;
  remainingSeconds: number;
  progress: number;
  error: string | null;
}

interface FormState {
  issuer: string;
  accountName: string;
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  importUri: string;
}

type PendingAction = { kind: 'delete'; entry: AuthenticatorEntry } | { kind: 'clear' } | null;
type AuthenticatorEntryDraft = Pick<
  AuthenticatorEntry,
  'issuer' | 'accountName' | 'secret' | 'digits' | 'period' | 'algorithm'
>;

const DEFAULT_FORM: FormState = {
  issuer: '',
  accountName: '',
  secret: '',
  digits: 6,
  period: 30,
  algorithm: 'SHA-1',
  importUri: '',
};

const DIGIT_OPTIONS = [6, 7, 8];
const PERIOD_OPTIONS = [15, 30, 60];
const ALGORITHM_OPTIONS: TotpAlgorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];
const SCREEN_CLIP_TIMEOUT_MS = 30000;
const SCREEN_CLIP_POLL_INTERVAL_MS = 700;

function formatIssuer(entry: AuthenticatorEntry) {
  return entry.issuer.trim() || '未命名服务';
}

function formatAccountName(entry: AuthenticatorEntry) {
  return entry.accountName.trim() || '未填写账号备注';
}

function normalizeDuplicateText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function findDuplicateAuthenticatorEntry(
  entries: AuthenticatorEntry[],
  candidate: AuthenticatorEntryDraft,
  excludedId?: string,
) {
  return entries.find((entry) => {
    if (excludedId && entry.id === excludedId) {
      return false;
    }

    return (
      normalizeDuplicateText(entry.issuer) === normalizeDuplicateText(candidate.issuer) &&
      normalizeDuplicateText(entry.accountName) === normalizeDuplicateText(candidate.accountName) &&
      normalizeBase32Secret(entry.secret) === normalizeBase32Secret(candidate.secret) &&
      normalizeTotpDigits(entry.digits) === normalizeTotpDigits(candidate.digits) &&
      normalizeTotpPeriod(entry.period) === normalizeTotpPeriod(candidate.period) &&
      entry.algorithm === candidate.algorithm
    );
  });
}

function createFormState(entry?: AuthenticatorEntry): FormState {
  if (!entry) {
    return DEFAULT_FORM;
  }

  return {
    issuer: entry.issuer,
    accountName: entry.accountName,
    secret: entry.secret,
    digits: entry.digits,
    period: entry.period,
    algorithm: entry.algorithm,
    importUri: '',
  };
}

function buildOtpAuthUri(entry: AuthenticatorEntry) {
  const issuer = entry.issuer.trim();
  const accountName = entry.accountName.trim();
  const label = issuer
    ? accountName
      ? `${issuer}:${accountName}`
      : issuer
    : accountName || 'Authenticator';
  const searchParams = new URLSearchParams();

  searchParams.set('secret', entry.secret);

  if (issuer) {
    searchParams.set('issuer', issuer);
  }

  searchParams.set('digits', String(entry.digits));
  searchParams.set('period', String(entry.period));
  searchParams.set('algorithm', entry.algorithm.replace(/-/g, ''));

  return `otpauth://totp/${encodeURIComponent(label)}?${searchParams.toString()}`;
}

function buildAuthenticatorExportFileName() {
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

  return `authenticator-backup-${parts.join('')}.json`;
}

function ensureJsonExtension(filePath: string) {
  return filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`;
}

function buildAuthenticatorExportContent(entries: AuthenticatorEntry[]) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 1,
      entries: entries.map((entry) => ({
        ...entry,
        otpauthUri: buildOtpAuthUri(entry),
      })),
    },
    null,
    2,
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('图片读取失败，请重试。'));
    };

    reader.onerror = () => {
      reject(new Error('图片读取失败，请重试。'));
    };

    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败，请重试。'));
    image.src = source;
  });
}

async function decodeQrFromImageFile(file: File) {
  const dataUrl = await readFileAsDataUrl(file);
  return decodeQrFromImageSource(dataUrl);
}

async function decodeQrFromImageSource(source: string) {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new Error('当前环境不支持二维码识别。');
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const result = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: 'attemptBoth',
  });

  if (!result?.data) {
    throw new Error('未在图片中识别到二维码。');
  }

  return result.data;
}

function waitForNextPoll(delayMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

export function AuthenticatorModal({ isOpen, onClose }: AuthenticatorModalProps) {
  const [entries, setEntries] = useState<AuthenticatorEntry[]>(() => loadAuthenticatorEntries());
  const [entryDisplays, setEntryDisplays] = useState<Record<string, EntryDisplayState>>({});
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(() => Date.now());
  const [isScreenClipScanning, setIsScreenClipScanning] = useState(false);
  const [shareEntry, setShareEntry] = useState<AuthenticatorEntry | null>(null);
  const [shareQrDataUrl, setShareQrDataUrl] = useState<string | null>(null);
  const [shareQrError, setShareQrError] = useState<string | null>(null);
  const [isGeneratingShareQr, setIsGeneratingShareQr] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSavingEntries, setIsSavingEntries] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    saveAuthenticatorEntries(entries);
  }, [entries]);

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
    if (!isOpen) {
      return undefined;
    }

    setTick(Date.now());
    const timerId = window.setInterval(() => {
      setTick(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      return undefined;
    }

    setIsScreenClipScanning(false);
    setShareEntry(null);
    setShareQrDataUrl(null);
    setShareQrError(null);
    setIsGeneratingShareQr(false);
    setPendingAction(null);
    setIsSavingEntries(false);
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!shareEntry) {
      return undefined;
    }

    let cancelled = false;

    const generateShareQr = async () => {
      setIsGeneratingShareQr(true);
      setShareQrError(null);

      try {
        const nextDataUrl = await QRCode.toDataURL(buildOtpAuthUri(shareEntry), {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 280,
          color: {
            dark: '#173358',
            light: '#ffffff',
          },
        });

        if (!cancelled) {
          setShareQrDataUrl(nextDataUrl);
        }
      } catch (qrError) {
        console.error('Failed to generate share QR:', qrError);

        if (!cancelled) {
          setShareQrDataUrl(null);
          setShareQrError('分享二维码生成失败，请重试。');
        }
      } finally {
        if (!cancelled) {
          setIsGeneratingShareQr(false);
        }
      }
    };

    generateShareQr().catch((qrError) => {
      console.error('Unexpected share QR generation failure:', qrError);
    });

    return () => {
      cancelled = true;
    };
  }, [shareEntry]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    if (!entries.length) {
      setEntryDisplays({});
      return undefined;
    }

    let cancelled = false;

    const refreshCodes = async () => {
      const nextEntries = await Promise.all(
        entries.map(async (entry) => {
          try {
            const result = await generateTotpCode(entry, tick);
            return [
              entry.id,
              {
                code: result.code,
                remainingSeconds: result.remainingSeconds,
                progress: result.progress,
                error: null,
              },
            ] as const;
          } catch (entryError) {
            return [
              entry.id,
              {
                code: '',
                remainingSeconds: entry.period,
                progress: 0,
                error: entryError instanceof Error ? entryError.message : '验证码生成失败。',
              },
            ] as const;
          }
        }),
      );

      if (!cancelled) {
        setEntryDisplays(Object.fromEntries(nextEntries));
      }
    };

    refreshCodes().catch((refreshError) => {
      console.error('Failed to refresh TOTP codes:', refreshError);
    });

    return () => {
      cancelled = true;
    };
  }, [entries, isOpen, tick]);

  const resetForm = (entry?: AuthenticatorEntry) => {
    setForm(createFormState(entry));
    setEditingId(entry?.id ?? null);
  };

  const handleFormChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const applyImportedUri = (uriText: string, sourceLabel: string) => {
    const parsed = parseOtpAuthUri(uriText);
    const nextEntryDraft: AuthenticatorEntryDraft = {
      issuer: parsed.issuer.trim(),
      accountName: parsed.accountName.trim(),
      secret: normalizeBase32Secret(parsed.secret),
      digits: normalizeTotpDigits(parsed.digits),
      period: normalizeTotpPeriod(parsed.period),
      algorithm: parsed.algorithm,
    };
    const duplicateEntry = findDuplicateAuthenticatorEntry(
      entries,
      nextEntryDraft,
      editingId ?? undefined,
    );

    if (duplicateEntry) {
      setError(`该二维码已经添加过了：${formatIssuer(duplicateEntry)}。`);
      setMessage(null);
      return;
    }

    setForm((previous) => ({
      ...previous,
      importUri: uriText,
      issuer: nextEntryDraft.issuer,
      accountName: nextEntryDraft.accountName,
      secret: nextEntryDraft.secret,
      digits: nextEntryDraft.digits,
      period: nextEntryDraft.period,
      algorithm: nextEntryDraft.algorithm,
    }));
    setMessage(`${sourceLabel}成功，已自动填入表单。`);
    setError(null);
  };

  if (!isOpen) {
    return null;
  }

  const handleParseImport = () => {
    try {
      applyImportedUri(form.importUri, '链接导入');
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : '导入失败，请检查内容。');
      setMessage(null);
    }
  };

  const handleSaveEntry = () => {
    const issuer = form.issuer.trim();
    const accountName = form.accountName.trim();
    const secret = normalizeBase32Secret(form.secret);

    if (!issuer && !accountName) {
      setError('请至少填写服务名称或账号备注。');
      setMessage(null);
      return;
    }

    try {
      validateTotpSecret(secret);
    } catch (validationError) {
      setError(
        validationError instanceof Error ? validationError.message : '密钥校验失败，请重试。',
      );
      setMessage(null);
      return;
    }

    const existingEntry = editingId
      ? entries.find((entry) => entry.id === editingId) ?? null
      : null;
    const nextEntry: AuthenticatorEntry = {
      id: editingId ?? crypto.randomUUID(),
      issuer,
      accountName,
      secret,
      digits: normalizeTotpDigits(form.digits),
      period: normalizeTotpPeriod(form.period),
      algorithm: form.algorithm,
      createdAt: existingEntry?.createdAt ?? Date.now(),
    };
    const duplicateEntry = findDuplicateAuthenticatorEntry(entries, nextEntry, editingId ?? undefined);

    if (duplicateEntry) {
      setError(`该二维码已经添加过了：${formatIssuer(duplicateEntry)}。`);
      setMessage(null);
      return;
    }

    setEntries((previous) => {
      if (!editingId) {
        return [...previous, nextEntry];
      }

      return previous.map((entry) => (entry.id === editingId ? nextEntry : entry));
    });

    resetForm();
    setMessage(editingId ? '已更新双因子认证条目。' : '已添加双因子认证条目。');
    setError(null);
  };

  const handleEditEntry = (entry: AuthenticatorEntry) => {
    resetForm(entry);
    setMessage(`正在编辑 ${formatIssuer(entry)}。`);
    setError(null);
  };

  const handleDeleteEntry = (entry: AuthenticatorEntry) => {
    setPendingAction({ kind: 'delete', entry });
    setError(null);
  };

  const handleClearEntries = () => {
    if (!entries.length) {
      return;
    }

    setPendingAction({ kind: 'clear' });
    setError(null);
  };

  const handleClosePendingAction = () => {
    setPendingAction(null);
  };

  const handleConfirmPendingAction = () => {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.kind === 'delete') {
      const { entry } = pendingAction;

      setEntries((previous) => previous.filter((item) => item.id !== entry.id));

      if (editingId === entry.id) {
        resetForm();
      }

      if (shareEntry?.id === entry.id) {
        handleCloseShareQr();
      }

      setMessage(`已删除 ${formatIssuer(entry)}。`);
    } else {
      setEntries([]);
      resetForm();
      handleCloseShareQr();
      setMessage('已清空所有双因子认证条目。');
    }

    setPendingAction(null);
    setError(null);
  };

  const handleSaveEntries = async () => {
    if (!entries.length) {
      setError('暂无可保存的双因子认证条目。');
      setMessage(null);
      return;
    }

    setIsSavingEntries(true);

    try {
      const selectedPath = await save({
        title: '保存双因子认证备份',
        defaultPath: buildAuthenticatorExportFileName(),
        filters: [
          {
            name: 'JSON',
            extensions: ['json'],
          },
        ],
      });

      if (!selectedPath) {
        return;
      }

      const finalPath = ensureJsonExtension(selectedPath);
      const savedPath = await invoke<string>('write_text_file', {
        filePath: finalPath,
        content: buildAuthenticatorExportContent(entries),
      });

      setMessage(`已保存双因子认证备份：${savedPath}`);
      setError(null);
    } catch (saveError) {
      console.error('Failed to save authenticator entries:', saveError);
      setError(saveError instanceof Error ? saveError.message : '保存备份失败，请重试。');
      setMessage(null);
    } finally {
      setIsSavingEntries(false);
    }
  };

  const handleCopyCode = async (
    entry: AuthenticatorEntry,
    display: EntryDisplayState | undefined,
  ) => {
    if (!display?.code || display.error) {
      setError(`“${formatIssuer(entry)}”当前无法生成可复制的验证码。`);
      setMessage(null);
      return;
    }

    try {
      await navigator.clipboard.writeText(display.code);
      setMessage(`已复制 ${formatIssuer(entry)} 的当前验证码。`);
      setError(null);
    } catch (copyError) {
      console.error('Failed to copy TOTP code:', copyError);
      setError('复制失败，请手动选择验证码。');
      setMessage(null);
    }
  };

  const handleStartScreenClipScan = async () => {
    if (isScreenClipScanning) {
      return;
    }

    setIsScreenClipScanning(true);
    setMessage('请在屏幕上框选二维码区域，完成截图后会自动识别。');
    setError(null);

    try {
      const previousClipboardImage = await invoke<string | null>('read_clipboard_image_data_url');

      await invoke('start_screen_clip');

      let nextClipboardImage: string | null = null;
      const deadline = Date.now() + SCREEN_CLIP_TIMEOUT_MS;

      while (Date.now() < deadline) {
        await waitForNextPoll(SCREEN_CLIP_POLL_INTERVAL_MS);

        const currentClipboardImage =
          await invoke<string | null>('read_clipboard_image_data_url');

        if (currentClipboardImage && currentClipboardImage !== previousClipboardImage) {
          nextClipboardImage = currentClipboardImage;
          break;
        }
      }

      if (!nextClipboardImage) {
        throw new Error('未检测到新的截图，请重试。');
      }

      const qrText = await decodeQrFromImageSource(nextClipboardImage);
      applyImportedUri(qrText, '屏幕框选识别');
    } catch (screenClipError) {
      console.error('Failed to scan QR from screen clip:', screenClipError);
      setError(
        screenClipError instanceof Error ? screenClipError.message : '屏幕截图识别失败，请重试。',
      );
      setMessage(null);
    } finally {
      setIsScreenClipScanning(false);
    }
  };

  const handlePickQrImage = () => {
    fileInputRef.current?.click();
  };

  const handleQrImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const qrText = await decodeQrFromImageFile(file);
      applyImportedUri(qrText, '图片识别');
    } catch (imageError) {
      setError(imageError instanceof Error ? imageError.message : '二维码图片识别失败。');
      setMessage(null);
    }
  };

  const handleOpenShareQr = (entry: AuthenticatorEntry) => {
    setShareEntry(entry);
    setShareQrDataUrl(null);
    setShareQrError(null);
  };

  const handleCloseShareQr = () => {
    setShareEntry(null);
    setShareQrDataUrl(null);
    setShareQrError(null);
    setIsGeneratingShareQr(false);
  };

  const handleCopyShareUri = async () => {
    if (!shareEntry) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildOtpAuthUri(shareEntry));
      setMessage(`已复制 ${formatIssuer(shareEntry)} 的分享链接。`);
      setError(null);
    } catch (copyError) {
      console.error('Failed to copy share uri:', copyError);
      setError('分享链接复制失败，请重试。');
      setMessage(null);
    }
  };

  const pendingActionTitle = pendingAction?.kind === 'delete' ? '确认删除' : '确认清空';
  const pendingActionDescription =
    pendingAction?.kind === 'delete'
      ? `确定删除“${formatIssuer(pendingAction.entry)}”这条双因子认证吗？`
      : '确定清空当前所有双因子认证条目吗？建议先点击“保存”导出备份。';
  const pendingActionConfirmText = pendingAction?.kind === 'delete' ? '确认删除' : '确认清空';

  return (
    <div
      className="tool-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="auth-tool-modal panel" role="dialog" aria-modal="true" aria-label="双因子认证">
        <div className="auth-tool-modal-head">
          <div>
            <h2>双因子认证</h2>
            <p>支持 Base32 密钥、otpauth 链接、摄像头扫码和二维码图片识别导入。</p>
          </div>
          <button
            type="button"
            className="auth-tool-modal-close"
            onClick={onClose}
            aria-label="关闭双因子认证"
          >
            ×
          </button>
        </div>

        <div className="auth-tool-modal-body">
          <aside className="auth-form-card">
            <div className="auth-scan-card">
              <div className="auth-section-head auth-section-head-row">
                <div>
                  <h3>扫码加入</h3>
                  <p>支持屏幕框选识别，也可以直接导入二维码截图或图片文件。</p>
                </div>
                <div className="auth-scan-head-actions">
                  <button
                    type="button"
                    className="auth-icon-btn"
                    onClick={handleStartScreenClipScan}
                    disabled={isScreenClipScanning}
                    aria-label="屏幕框选识别二维码"
                    title={isScreenClipScanning ? '正在等待屏幕截图' : '屏幕框选识别二维码'}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 9V5h4M15 5h5v5M20 15v4h-4M9 20H4v-5M8 8h8v8H8z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="auth-icon-btn"
                    onClick={handlePickQrImage}
                    disabled={isScreenClipScanning}
                    aria-label="导入二维码图片"
                    title="导入二维码图片"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M5 5h14v14H5z"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m8 15 2.5-2.5 2 2L16 11l3 4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="9" cy="9" r="1.3" fill="currentColor" />
                    </svg>
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="auth-hidden-input"
                onChange={handleQrImageChange}
              />
            </div>

            <label className="auth-field auth-field-full">
              <span>快速导入</span>
              <textarea
                value={form.importUri}
                onChange={(event) => handleFormChange('importUri', event.target.value)}
                placeholder="粘贴 otpauth://totp/... 链接后，点击下方“解析导入”"
              />
            </label>

            <div className="auth-inline-actions">
              <button type="button" className="btn btn-secondary" onClick={handleParseImport}>
                解析导入
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetForm();
                  setMessage(null);
                  setError(null);
                }}
              >
                重置表单
              </button>
            </div>

            <div className="auth-form-grid">
              <label className="auth-field">
                <span>服务名称</span>
                <input
                  type="text"
                  value={form.issuer}
                  onChange={(event) => handleFormChange('issuer', event.target.value)}
                  placeholder="例如 GitHub / 阿里云 / JumpServer"
                />
              </label>

              <label className="auth-field">
                <span>账号备注</span>
                <input
                  type="text"
                  value={form.accountName}
                  onChange={(event) => handleFormChange('accountName', event.target.value)}
                  placeholder="例如 admin@example.com / jienkai"
                />
              </label>

              <label className="auth-field auth-field-full">
                <span>Base32 密钥</span>
                <input
                  type="text"
                  value={form.secret}
                  onChange={(event) => handleFormChange('secret', event.target.value)}
                  placeholder="输入或粘贴 Base32 Secret，支持空格和短横线"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <div className="auth-meta-grid">
                <label className="auth-field">
                  <span>位数</span>
                  <select
                    value={form.digits}
                    onChange={(event) =>
                      handleFormChange('digits', normalizeTotpDigits(Number(event.target.value)))
                    }
                  >
                    {DIGIT_OPTIONS.map((digits) => (
                      <option key={digits} value={digits}>
                        {digits} 位
                      </option>
                    ))}
                  </select>
                </label>

                <label className="auth-field">
                  <span>刷新周期</span>
                  <select
                    value={form.period}
                    onChange={(event) =>
                      handleFormChange('period', normalizeTotpPeriod(Number(event.target.value)))
                    }
                  >
                    {PERIOD_OPTIONS.map((period) => (
                      <option key={period} value={period}>
                        {period} 秒
                      </option>
                    ))}
                  </select>
                </label>

                <label className="auth-field">
                  <span>算法</span>
                  <select
                    value={form.algorithm}
                    onChange={(event) =>
                      handleFormChange('algorithm', event.target.value as TotpAlgorithm)
                    }
                  >
                    {ALGORITHM_OPTIONS.map((algorithm) => (
                      <option key={algorithm} value={algorithm}>
                        {algorithm}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="auth-inline-actions auth-save-actions">
              <button type="button" className="btn btn-primary" onClick={handleSaveEntry}>
                {editingId ? '更新条目' : '添加条目'}
              </button>
            </div>

            {message ? <p className="auth-feedback">{message}</p> : null}
            {error ? <p className="auth-error">{error}</p> : null}
          </aside>

          <section className="auth-list-card">
            <div className="auth-section-head auth-section-head-row">
              <div>
                <h3>验证码列表</h3>
                <p>点击卡片中的数字即可复制当前验证码。</p>
              </div>
              <div className="auth-list-tools">
                <span>{entries.length} 条</span>
                <button
                  type="button"
                  className="auth-text-btn"
                  onClick={handleSaveEntries}
                  disabled={!entries.length || isSavingEntries}
                >
                  {isSavingEntries ? '保存中...' : '保存'}
                </button>
                <button
                  type="button"
                  className="auth-text-btn auth-text-btn-danger"
                  onClick={handleClearEntries}
                  disabled={!entries.length || isSavingEntries}
                >
                  清空
                </button>
              </div>
            </div>

            <div className="auth-card-grid">
              {entries.length ? (
                entries.map((entry) => {
                  const display = entryDisplays[entry.id];
                  const isInvalid = Boolean(display?.error);
                  const remainingSeconds = display?.remainingSeconds ?? entry.period;
                  const isExpiringSoon = !isInvalid && remainingSeconds <= 5;
                  const progressDegrees = (1 - (display?.progress ?? 0)) * 360;

                  return (
                    <article
                      key={entry.id}
                      className={`auth-entry-card ${isInvalid ? 'is-invalid' : ''}`}
                    >
                      <div className="auth-entry-head">
                        <div className="auth-entry-copy">
                          <strong className="auth-entry-issuer">{formatIssuer(entry)}</strong>
                          <span className="auth-entry-account">{formatAccountName(entry)}</span>
                        </div>
                        <div className="auth-entry-actions">
                          <button
                            type="button"
                            className="auth-card-action"
                            onClick={() => handleEditEntry(entry)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="auth-card-action is-danger"
                            onClick={() => handleDeleteEntry(entry)}
                          >
                            删除
                          </button>
                        </div>
                      </div>

                      <div className="auth-code-row">
                        <button
                          type="button"
                          className="auth-code-btn"
                          onClick={() => handleCopyCode(entry, display)}
                          disabled={!display?.code || isInvalid}
                        >
                          <span
                            className={`auth-code ${isInvalid ? 'is-error' : ''} ${
                              isExpiringSoon ? 'is-warning' : ''
                            }`}
                          >
                            {isInvalid ? '密钥无效' : display?.code ?? '------'}
                          </span>
                          <span className="auth-code-hint">
                            {isInvalid ? '请编辑后重新保存' : '点击复制当前验证码'}
                          </span>
                        </button>

                        <div
                          className={`auth-timer ${isInvalid ? 'is-invalid' : ''} ${
                            isExpiringSoon ? 'is-warning' : ''
                          }`}
                          style={{
                            background: `conic-gradient(${
                              isExpiringSoon ? '#ff4b55' : '#0e57f0'
                            } ${progressDegrees}deg, ${isExpiringSoon ? '#f8c7cb' : '#dbe6f5'} 0deg)`,
                          }}
                          aria-label={
                            isInvalid
                              ? '当前条目密钥无效'
                              : `${remainingSeconds} 秒后刷新`
                          }
                        >
                          <div
                            className={`auth-timer-inner ${isExpiringSoon ? 'is-warning' : ''}`}
                          >
                            {isInvalid ? '!' : remainingSeconds}
                          </div>
                        </div>
                      </div>

                      <div className="auth-entry-foot">
                        <span>{entry.digits} 位验证码</span>
                        <span>{entry.period} 秒刷新</span>
                        <span>{entry.algorithm}</span>
                        <button
                          type="button"
                          className="auth-share-btn"
                          onClick={() => handleOpenShareQr(entry)}
                          aria-label="分享二维码"
                          title="分享二维码"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Zm8 0h2v2h-2v-2Zm4 0h4v2h-4v-2Zm-4 4h2v2h-2v-2Zm2-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h2v4h-2v-4Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty-state auth-empty-state">
                  <p>还没有双因子认证条目。你可以扫码、导入 otpauth 链接，或者手动添加 Base32 密钥。</p>
                </div>
              )}
            </div>
          </section>
        </div>

        {shareEntry ? (
          <div
            className="auth-share-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleCloseShareQr();
              }
            }}
          >
            <section
              className="auth-share-modal"
              role="dialog"
              aria-modal="true"
              aria-label="分享二维码"
            >
              <div className="auth-share-modal-head">
                <div>
                  <h3>分享二维码</h3>
                  <p>扫码后可直接导入 {formatIssuer(shareEntry)} 的双因子配置。</p>
                </div>
                <button
                  type="button"
                  className="auth-tool-modal-close"
                  onClick={handleCloseShareQr}
                  aria-label="关闭分享二维码"
                >
                  ×
                </button>
              </div>

              <div className="auth-share-modal-body">
                <div className="auth-share-card">
                  {isGeneratingShareQr ? (
                    <div className="auth-share-loading">正在生成二维码...</div>
                  ) : shareQrError ? (
                    <div className="auth-share-loading is-error">{shareQrError}</div>
                  ) : shareQrDataUrl ? (
                    <img
                      src={shareQrDataUrl}
                      alt={`${formatIssuer(shareEntry)} 的分享二维码`}
                      className="auth-share-image"
                    />
                  ) : null}
                </div>

                <div className="auth-share-copy">
                  <strong>{formatIssuer(shareEntry)}</strong>
                  <span>{formatAccountName(shareEntry)}</span>
                </div>

                <div className="auth-inline-actions auth-share-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCopyShareUri}
                  >
                    复制分享链接
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleCloseShareQr}
                  >
                    完成
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {pendingAction ? (
          <div
            className="auth-confirm-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                handleClosePendingAction();
              }
            }}
          >
            <section
              className="auth-confirm-modal panel"
              role="dialog"
              aria-modal="true"
              aria-label={pendingActionTitle}
            >
              <div className="auth-confirm-copy">
                <h3>{pendingActionTitle}</h3>
                <p>{pendingActionDescription}</p>
              </div>

              <div className="auth-inline-actions auth-confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClosePendingAction}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn auth-confirm-btn-danger"
                  onClick={handleConfirmPendingAction}
                >
                  {pendingActionConfirmText}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}
