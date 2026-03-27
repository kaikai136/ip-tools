import { AppConfig, PasswordRecord } from '../types';

const CONFIG_KEY = 'ip-diagnostic-tool-config';
const PASSWORD_HISTORY_KEY = 'ip-diagnostic-tool-password-history';

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
      return JSON.parse(stored) as PasswordRecord[];
    }
  } catch (error) {
    console.error('Failed to load password history:', error);
  }

  return [];
}
