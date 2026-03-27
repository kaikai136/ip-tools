export type ScanMode = 'ip' | 'port';
export type HostStatus = 'online' | 'offline' | 'scanning' | 'untested';
export type PingStatus = 'online' | 'timeout';

export interface HostInfo {
  ip: string;
  status: HostStatus;
  responseTime?: number;
  openPorts: number[];
  scannedPorts: number;
  lastUpdated: number;
}

export interface HostScanResultEvent {
  ip: string;
  status: 'online' | 'offline';
  responseTime?: number;
  openPorts: number[];
  scannedPorts: number;
}

export interface ScanCompleteEvent {
  totalHosts: number;
  activeHosts: number;
  openPortCount: number;
  duration: number;
}

export interface ScanErrorEvent {
  error: string;
}

export interface PingCommandResult {
  ip: string;
  status: PingStatus;
  responseTime?: number;
}

export interface AppConfig {
  networkSegment: string;
  hostStart: string;
  hostEnd: string;
  portsInput: string;
}

export interface PasswordRecord {
  id: string;
  password: string;
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  createdAt: number;
}

export const EVENTS = {
  HOST_SCAN_RESULT: 'host-scan-result',
  SCAN_COMPLETE: 'scan-complete',
  SCAN_ERROR: 'scan-error',
} as const;
