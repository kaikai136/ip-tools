import { AppConfig, PasswordRecord, PingHistoryRecord } from '../types';

const CONFIG_KEY = 'ip-diagnostic-tool-config';
const PASSWORD_HISTORY_KEY = 'ip-diagnostic-tool-password-history';
const PING_HISTORY_KEY = 'ip-diagnostic-tool-ping-history';
const EXPORT_PATH_KEY = 'ip-diagnostic-tool-last-export-path';

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

export function loadConfig(): Partial<AppConfig> | null {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored) as Partial<AppConfig>;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }

  return null;
}

export function savePasswordHistory(history: PasswordRecord[]): void {
  try {
    localStorage.setItem(PASSWORD_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save password history:', error);
  }
}

export function loadPasswordHistory(): PasswordRecord[] {
  try {
    const stored = localStorage.getItem(PASSWORD_HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Array<Partial<PasswordRecord>>;

      return parsed
        .filter((record) => typeof record.password === 'string')
        .map((record) => ({
          id: record.id ?? crypto.randomUUID(),
          projectName: typeof record.projectName === 'string' ? record.projectName : '',
          password: record.password ?? '',
          length: typeof record.length === 'number' ? record.length : 16,
          includeUppercase: Boolean(record.includeUppercase),
          includeLowercase:
            typeof record.includeLowercase === 'boolean' ? record.includeLowercase : true,
          includeNumbers:
            typeof record.includeNumbers === 'boolean' ? record.includeNumbers : true,
          includeSymbols: Boolean(record.includeSymbols),
          createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
        }));
    }
  } catch (error) {
    console.error('Failed to load password history:', error);
  }

  return [];
}

export function savePingHistory(history: PingHistoryRecord[]): void {
  try {
    localStorage.setItem(PING_HISTORY_KEY, JSON.stringify(history));
  } catch (error) {
    console.error('Failed to save ping history:', error);
  }
}

export function loadPingHistory(): PingHistoryRecord[] {
  try {
    const stored = localStorage.getItem(PING_HISTORY_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Array<Partial<PingHistoryRecord>>;

      return parsed
        .filter((record) => typeof record.target === 'string')
        .map((record) => ({
          id: record.id ?? crypto.randomUUID(),
          target: record.target ?? '',
          successCount: typeof record.successCount === 'number' ? record.successCount : 0,
          failureCount: typeof record.failureCount === 'number' ? record.failureCount : 0,
          lossRate: typeof record.lossRate === 'number' ? record.lossRate : 0,
          averageResponseTime:
            typeof record.averageResponseTime === 'number' ? record.averageResponseTime : null,
          minResponseTime:
            typeof record.minResponseTime === 'number' ? record.minResponseTime : null,
          maxResponseTime:
            typeof record.maxResponseTime === 'number' ? record.maxResponseTime : null,
          jitter: typeof record.jitter === 'number' ? record.jitter : null,
          totalCount: typeof record.totalCount === 'number' ? record.totalCount : 0,
          createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
        }));
    }
  } catch (error) {
    console.error('Failed to load ping history:', error);
  }

  return [];
}

export function saveLastExportPath(path: string): void {
  try {
    localStorage.setItem(EXPORT_PATH_KEY, path);
  } catch (error) {
    console.error('Failed to save export path:', error);
  }
}

export function loadLastExportPath(): string | null {
  try {
    return localStorage.getItem(EXPORT_PATH_KEY);
  } catch (error) {
    console.error('Failed to load export path:', error);
  }

  return null;
}
