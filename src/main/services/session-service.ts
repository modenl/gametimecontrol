import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  ActiveSession,
  Availability,
  PersistedState,
  SessionExitReason,
  UsageLedger,
  UsageRecord
} from '../types';
import { clamp, getWeekStartLocal, secondsBetween } from './time';
import { StorageService } from './storage';

export class SessionService extends EventEmitter {
  private tickHandle: NodeJS.Timeout | null = null;
  private finalizingSessionId: string | null = null;

  constructor(private readonly storage: StorageService) {
    super();
  }

  async recover(): Promise<void> {
    await this.normalizeUsageWindow();
    await this.normalizeCooldown();

    const state = this.storage.getState();
    if (!state.activeSession) {
      this.emitChanged();
      return;
    }

    const remaining = this.calculateRemainingSeconds(state.activeSession);
    if (remaining <= 0) {
      await this.finalizeRecoveredTimeout(state.activeSession);
      return;
    }

    state.activeSession = {
      ...state.activeSession,
      remainingSeconds: remaining,
      status: 'running'
    };
    await this.storage.saveState(state);
    this.startTicker();
    this.emitChanged();
  }

  hasActiveSession(): boolean {
    return Boolean(this.storage.getState().activeSession);
  }

  getAvailability(): Availability {
    const config = this.storage.getConfig();
    const state = this.storage.getState();
    const usage = this.storage.getUsage();
    const weeklyRemainingSeconds = Math.max(0, config.weeklyQuotaSeconds - usage.usedSeconds);

    if (state.activeSession) {
      return {
        canStart: true,
        reason: 'active-session',
        weeklyRemainingSeconds,
        nextAllowedAt: null,
        launchBudgetSeconds: Math.max(1, Math.min(weeklyRemainingSeconds, state.activeSession.remainingSeconds))
      };
    }

    if (
      config.minGapSeconds > 0 &&
      state.cooldownUntil &&
      new Date(state.cooldownUntil).getTime() > Date.now()
    ) {
      return {
        canStart: false,
        reason: 'cooldown',
        weeklyRemainingSeconds,
        nextAllowedAt: state.cooldownUntil,
        launchBudgetSeconds: 0
      };
    }

    if (weeklyRemainingSeconds <= 0) {
      return {
        canStart: false,
        reason: 'quota',
        weeklyRemainingSeconds: 0,
        nextAllowedAt: null,
        launchBudgetSeconds: 0
      };
    }

    return {
      canStart: true,
      reason: 'ok',
      weeklyRemainingSeconds,
      nextAllowedAt: null,
      launchBudgetSeconds: Math.min(config.sessionMaxSeconds, weeklyRemainingSeconds)
    };
  }

  async startSession(): Promise<void> {
    await this.normalizeUsageWindow();
    await this.normalizeCooldown();

    const state = this.storage.getState();
    if (state.activeSession) {
      throw new Error('A session is already active.');
    }

    const availability = this.getAvailability();
    if (!availability.canStart || availability.launchBudgetSeconds <= 0) {
      throw new Error('A new session is not available right now.');
    }

    const config = this.storage.getConfig();
    const now = new Date();
    const baseDurationSeconds = availability.launchBudgetSeconds;
    const totalDurationSeconds = baseDurationSeconds + config.graceSeconds;
    const session: ActiveSession = {
      id: randomUUID(),
      startedAt: now.toISOString(),
      plannedEndAt: new Date(now.getTime() + totalDurationSeconds * 1000).toISOString(),
      remainingSeconds: totalDurationSeconds,
      baseDurationSeconds,
      graceSecondsGranted: config.graceSeconds,
      status: 'running'
    };

    await this.storage.saveState({
      ...state,
      activeSession: session,
      desktopUnlocked: false
    });

    this.startTicker();
    this.emitChanged();
  }

  async stopByAdmin(): Promise<void> {
    const session = this.storage.getState().activeSession;
    if (!session) {
      return;
    }

    await this.finalize(session, 'admin-stop', new Date());
  }

  async syncDerivedState(): Promise<void> {
    await this.normalizeUsageWindow();
    await this.normalizeCooldown();
    this.emitChanged();
  }

  private startTicker(): void {
    this.stopTicker();
    this.tickHandle = setInterval(() => {
      void this.handleTick();
    }, 1000);
  }

  private stopTicker(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  private async handleTick(): Promise<void> {
    const state = this.storage.getState();
    const session = state.activeSession;
    if (!session) {
      this.stopTicker();
      return;
    }

    const remainingSeconds = this.calculateRemainingSeconds(session);
    if (remainingSeconds <= 0) {
      await this.finalize(session, 'timeout', new Date(session.plannedEndAt));
      return;
    }

    if (remainingSeconds !== session.remainingSeconds) {
      state.activeSession = {
        ...session,
        remainingSeconds
      };
      await this.storage.saveState(state);
      this.emitChanged();
    }
  }

  private calculateRemainingSeconds(session: ActiveSession): number {
    return Math.max(0, Math.ceil((new Date(session.plannedEndAt).getTime() - Date.now()) / 1000));
  }

  private async finalizeRecoveredTimeout(session: ActiveSession): Promise<void> {
    await this.finalize(session, 'expired-while-offline', new Date(session.plannedEndAt));
  }

  private async finalize(session: ActiveSession, reason: SessionExitReason, endedAt: Date): Promise<void> {
    if (this.finalizingSessionId === session.id) {
      return;
    }

    this.finalizingSessionId = session.id;
    this.stopTicker();
    await this.normalizeUsageWindow();

    const config = this.storage.getConfig();
    const usage = this.storage.getUsage();
    const state = this.storage.getState();
    const totalPlayedSeconds =
      reason === 'timeout' || reason === 'expired-while-offline'
        ? secondsBetween(session.startedAt, session.plannedEndAt)
        : secondsBetween(session.startedAt, endedAt.toISOString());
    const countedQuotaSeconds = clamp(
      Math.min(totalPlayedSeconds, session.baseDurationSeconds),
      1,
      Math.max(1, session.baseDurationSeconds)
    );

    const record: UsageRecord = {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: endedAt.toISOString(),
      usedSeconds: countedQuotaSeconds,
      graceSecondsGranted: session.graceSecondsGranted,
      reason
    };

    const nextUsage: UsageLedger = {
      ...usage,
      usedSeconds: clamp(usage.usedSeconds + countedQuotaSeconds, 0, config.weeklyQuotaSeconds),
      graceSecondsGranted: usage.graceSecondsGranted + session.graceSecondsGranted,
      sessions: [record, ...usage.sessions].slice(0, 32)
    };
    const nextState: PersistedState = {
      ...state,
      activeSession: null,
      lastSessionEndedAt: endedAt.toISOString(),
      cooldownUntil:
        config.minGapSeconds > 0
          ? new Date(endedAt.getTime() + config.minGapSeconds * 1000).toISOString()
          : null
    };

    await this.storage.saveUsage(nextUsage);
    await this.storage.saveState(nextState);
    this.finalizingSessionId = null;
    this.emitChanged();
  }

  private async normalizeUsageWindow(): Promise<void> {
    const usage = this.storage.getUsage();
    const currentWeekStart = getWeekStartLocal(new Date()).toISOString();
    if (usage.weekStart === currentWeekStart) {
      return;
    }

    await this.storage.saveUsage({
      weekStart: currentWeekStart,
      usedSeconds: 0,
      graceExtensionsUsed: 0,
      graceSecondsGranted: 0,
      sessions: []
    });
  }

  private async normalizeCooldown(): Promise<void> {
    const config = this.storage.getConfig();
    const state = this.storage.getState();
    if (!state.cooldownUntil) {
      return;
    }
    if (config.minGapSeconds > 0 && new Date(state.cooldownUntil).getTime() > Date.now()) {
      return;
    }

    await this.storage.saveState({
      ...state,
      cooldownUntil: null
    });
  }

  private emitChanged(): void {
    this.emit('changed');
  }
}