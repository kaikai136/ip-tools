import { AppConfig } from '../types';

const CONFIG_KEY = 'ip-diagnostic-tool-config';

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
