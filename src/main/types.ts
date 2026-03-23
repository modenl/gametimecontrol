export interface ManagedGame {
  id: string;
  name: string;
  exePath: string;
  launchArgs: string[];
  workingDir?: string;
  iconPath?: string;
  enabled: boolean;
}

export interface InstallSettings {
  childAccountName: string;
  shellReplacementEnabled: boolean;
  startupRegistered: boolean;
}

export interface PolicyConfig {
  adminPasswordHash: string;
  weeklyQuotaSeconds: number;
  sessionMaxSeconds: number;
  minGapSeconds: number;
  managedGames: ManagedGame[];
  install: InstallSettings;
}

export type SessionExitReason =
  | 'natural'
  | 'timeout'
  | 'manual'
  | 'admin-stop'
  | 'expired-while-offline';

export type SessionStatus = 'running' | 'awaiting-resume';

export interface ActiveSession {
  id: string;
  appId: string;
  appName: string;
  exePath: string;
  launchArgs: string[];
  workingDir?: string;
  startedAt: string;
  plannedEndAt: string;
  remainingSeconds: number;
  status: SessionStatus;
  pid?: number;
}

export interface PersistedState {
  activeSession: ActiveSession | null;
  cooldownUntil: string | null;
  lastSessionEndedAt: string | null;
  desktopUnlocked: boolean;
}

export interface UsageRecord {
  id: string;
  appId: string;
  appName: string;
  startedAt: string;
  endedAt: string;
  usedSeconds: number;
  reason: SessionExitReason;
}

export interface UsageLedger {
  weekStart: string;
  usedSeconds: number;
  sessions: UsageRecord[];
}

export interface RendererConfig {
  weeklyQuotaSeconds: number;
  sessionMaxSeconds: number;
  minGapSeconds: number;
  managedGames: ManagedGame[];
  install: InstallSettings;
}

export interface Availability {
  canStart: boolean;
  reason: 'ok' | 'cooldown' | 'quota' | 'active-session';
  weeklyRemainingSeconds: number;
  nextAllowedAt: string | null;
  launchBudgetSeconds: number;
}

export interface RendererSnapshot {
  config: RendererConfig;
  state: PersistedState;
  usage: UsageLedger;
  availability: Availability;
  now: string;
}

export interface PolicyUpdateInput {
  weeklyQuotaMinutes: number;
  sessionMaxMinutes: number;
  minGapHours: number;
  managedGames: ManagedGame[];
  install: InstallSettings;
}

export interface PasswordUpdateInput {
  currentPassword: string;
  nextPassword: string;
}
