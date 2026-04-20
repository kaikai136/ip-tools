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

export interface PingHistoryRecord {
  id: string;
  target: string;
  successCount: number;
  failureCount: number;
  lossRate: number;
  averageResponseTime: number | null;
  minResponseTime: number | null;
  maxResponseTime: number | null;
  jitter: number | null;
  totalCount: number;
  createdAt: number;
}

export interface PortToolScanResult {
  host: string;
  openPorts: number[];
  scannedPorts: number;
  duration: number;
}

export interface PortToolProgressEvent {
  host: string;
  scannedPorts: number;
  totalPorts: number;
  openPorts: number;
}

export interface PortQuickTestResult {
  host: string;
  port: number;
  isOpen: boolean;
  duration: number;
}

export interface AppConfig {
  networkSegment: string;
  hostStart: string;
  hostEnd: string;
  portsInput: string;
}

export interface PasswordRecord {
  id: string;
  projectName: string;
  password: string;
  length: number;
  includeUppercase: boolean;
  includeLowercase: boolean;
  includeNumbers: boolean;
  includeSymbols: boolean;
  createdAt: number;
}

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface AuthenticatorEntry {
  id: string;
  issuer: string;
  accountName: string;
  secret: string;
  digits: number;
  period: number;
  algorithm: TotpAlgorithm;
  createdAt: number;
}

export const EVENTS = {
  HOST_SCAN_RESULT: 'host-scan-result',
  SCAN_COMPLETE: 'scan-complete',
  SCAN_ERROR: 'scan-error',
  PORT_TOOL_COMPLETE: 'port-tool-complete',
  PORT_TOOL_ERROR: 'port-tool-error',
  PORT_TOOL_PROGRESS: 'port-tool-progress',
} as const;
