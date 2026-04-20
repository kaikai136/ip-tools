import { TotpAlgorithm } from '../types';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpOptions {
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
}

export interface ParsedOtpAuthUri extends TotpOptions {
  issuer: string;
  accountName: string;
}

export interface TotpCodeResult {
  code: string;
  remainingSeconds: number;
  progress: number;
}

function normalizeInteger(value: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.round(value);
}

export function normalizeTotpDigits(value: number) {
  return Math.min(8, Math.max(6, normalizeInteger(value, 6)));
}

export function normalizeTotpPeriod(value: number) {
  return Math.min(120, Math.max(15, normalizeInteger(value, 30)));
}

export function normalizeTotpAlgorithm(value: string | null | undefined): TotpAlgorithm {
  const normalized = value?.trim().toUpperCase();

  if (normalized === 'SHA256' || normalized === 'SHA-256') {
    return 'SHA-256';
  }

  if (normalized === 'SHA512' || normalized === 'SHA-512') {
    return 'SHA-512';
  }

  return 'SHA-1';
}

export function normalizeBase32Secret(value: string) {
  return value.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/g, '');
}

export function decodeBase32Secret(secret: string) {
  const normalized = normalizeBase32Secret(secret);

  if (!normalized) {
    throw new Error('请输入 Base32 格式的密钥。');
  }

  let buffer = 0;
  let bitCount = 0;
  const bytes: number[] = [];

  for (const character of normalized) {
    const value = BASE32_ALPHABET.indexOf(character);

    if (value === -1) {
      throw new Error('密钥格式不正确，只支持 Base32 字符。');
    }

    buffer = (buffer << 5) | value;
    bitCount += 5;

    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push((buffer >> bitCount) & 0xff);
    }
  }

  if (!bytes.length) {
    throw new Error('密钥内容无效，请检查后重试。');
  }

  return new Uint8Array(bytes);
}

export function validateTotpSecret(secret: string) {
  decodeBase32Secret(secret);
}

function decodeOtpLabel(pathname: string) {
  try {
    return decodeURIComponent(pathname.replace(/^\/+/, ''));
  } catch (error) {
    throw new Error('otpauth 链接中的标签无法解析。');
  }
}

function parseNumericParam(value: string | null, fallback: number, normalize: (value: number) => number) {
  if (!value?.trim()) {
    return fallback;
  }

  return normalize(Number.parseInt(value.trim(), 10));
}

export function parseOtpAuthUri(input: string): ParsedOtpAuthUri {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error('请先粘贴 otpauth:// 链接。');
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch (error) {
    throw new Error('导入内容不是有效的 otpauth 链接。');
  }

  if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') {
    throw new Error('当前只支持导入 otpauth://totp/... 链接。');
  }

  const label = decodeOtpLabel(url.pathname).trim();
  const separatorIndex = label.indexOf(':');
  const issuerFromLabel =
    separatorIndex >= 0 ? label.slice(0, separatorIndex).trim() : '';
  const accountFromLabel =
    separatorIndex >= 0 ? label.slice(separatorIndex + 1).trim() : label;
  const issuerFromQuery = url.searchParams.get('issuer')?.trim() ?? '';
  const secret = url.searchParams.get('secret')?.trim() ?? '';

  if (!secret) {
    throw new Error('otpauth 链接缺少 secret 参数。');
  }

  return {
    issuer: issuerFromQuery || issuerFromLabel,
    accountName: accountFromLabel,
    secret: normalizeBase32Secret(secret),
    digits: parseNumericParam(url.searchParams.get('digits'), 6, normalizeTotpDigits),
    period: parseNumericParam(url.searchParams.get('period'), 30, normalizeTotpPeriod),
    algorithm: normalizeTotpAlgorithm(url.searchParams.get('algorithm')),
  };
}

function createCounterBuffer(counter: number) {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  const high = Math.floor(counter / 2 ** 32);
  const low = counter >>> 0;

  view.setUint32(0, high);
  view.setUint32(4, low);

  return buffer;
}

export async function generateTotpCode(
  options: TotpOptions,
  timestamp = Date.now(),
): Promise<TotpCodeResult> {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    throw new Error('当前环境不支持身份验证码计算。');
  }

  const digits = normalizeTotpDigits(options.digits);
  const period = normalizeTotpPeriod(options.period);
  const algorithm = normalizeTotpAlgorithm(options.algorithm);
  const secretBytes = decodeBase32Secret(options.secret);
  const seconds = Math.floor(timestamp / 1000);
  const counter = Math.floor(seconds / period);
  const elapsedSeconds = seconds % period;
  const remainingSeconds = period - elapsedSeconds;

  const key = await subtle.importKey(
    'raw',
    secretBytes,
    {
      name: 'HMAC',
      hash: { name: algorithm },
    },
    false,
    ['sign'],
  );
  const signature = await subtle.sign('HMAC', key, createCounterBuffer(counter));
  const hash = new Uint8Array(signature);
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  const code = (binary % 10 ** digits).toString().padStart(digits, '0');

  return {
    code,
    remainingSeconds,
    progress: elapsedSeconds / period,
  };
}
