export interface ChildProfileSettings {
  displayName: string;
}

export interface PolicyConfig {
  adminPasswordHash: string;
  weeklyQuotaSeconds: number;
  sessionMaxSeconds: number;
  graceSeconds: number;
  minGapSeconds: number;
  childProfile: ChildProfileSettings;
}

export type SessionExitReason = 'timeout' | 'admin-stop' | 'expired-while-offline';

export type SessionStatus = 'running';

export interface ActiveSession {
  id: string;
  startedAt: string;
  plannedEndAt: string;
  remainingSeconds: number;
  baseDurationSeconds: number;
  graceSecondsGranted: number;
  status: SessionStatus;
}

export interface PersistedState {
  activeSession: ActiveSession | null;
  cooldownUntil: string | null;
  lastSessionEndedAt: string | null;
  desktopUnlocked: boolean;
}

export interface UsageRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  usedSeconds: number;
  graceSecondsGranted: number;
  reason: SessionExitReason;
}

export interface UsageLedger {
  weekStart: string;
  usedSeconds: number;
  graceExtensionsUsed: number;
  graceSecondsGranted: number;
  sessions: UsageRecord[];
}

export interface RendererConfig {
  weeklyQuotaSeconds: number;
  sessionMaxSeconds: number;
  graceSeconds: number;
  minGapSeconds: number;
  childProfile: ChildProfileSettings;
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
  graceMinutes: number;
  minGapHours: number;
  childProfile: ChildProfileSettings;
}

export interface PasswordUpdateInput {
  currentPassword: string;
  nextPassword: string;
}

export interface CountdownEvidenceImage {
  id: string;
  sessionId: string;
  shotNumber: number;
  capturedAt: string;
  filePath: string;
  fileUrl: string;
}

export interface CountdownEvidenceSession {
  sessionId: string;
  capturedAt: string;
  imageCount: number;
  images: CountdownEvidenceImage[];
}
