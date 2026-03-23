import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import type {
  ActiveSession,
  Availability,
  ManagedGame,
  PersistedState,
  SessionExitReason,
  UsageLedger,
  UsageRecord
} from '../types';
import { clamp, getWeekStartLocal, secondsBetween } from './time';
import { LauncherService } from './launcher-service';
import { StorageService } from './storage';

export class SessionService extends EventEmitter {
  private activeProcess: ChildProcess | null = null;

  private tickHandle: NodeJS.Timeout | null = null;

  private finalizingSessionId: string | null = null;

  constructor(
    private readonly storage: StorageService,
    private readonly launcher: LauncherService
  ) {
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
      status: 'awaiting-resume',
      pid: undefined
    };
    await this.storage.saveState(state);
    this.emitChanged();
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

    if (state.cooldownUntil && new Date(state.cooldownUntil).getTime() > Date.now()) {
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

  async startOrResume(game: ManagedGame): Promise<void> {
    await this.normalizeUsageWindow();
    await this.normalizeCooldown();

    const state = this.storage.getState();
    if (state.activeSession) {
      if (state.activeSession.appId !== game.id) {
        throw new Error('A different session is already active.');
      }
      await this.resumeExistingSession(game, state.activeSession);
      return;
    }

    const availability = this.getAvailability();
    if (!availability.canStart || availability.launchBudgetSeconds <= 0) {
      throw new Error('Game launch is not available right now.');
    }

    const process = await this.launcher.launch(game);
    const now = new Date();
    const session: ActiveSession = {
      id: randomUUID(),
      appId: game.id,
      appName: game.name,
      exePath: game.exePath,
      launchArgs: [...game.launchArgs],
      workingDir: game.workingDir,
      startedAt: now.toISOString(),
      plannedEndAt: new Date(now.getTime() + availability.launchBudgetSeconds * 1000).toISOString(),
      remainingSeconds: availability.launchBudgetSeconds,
      status: 'running',
      pid: process.pid
    };

    await this.storage.saveState({
      ...state,
      activeSession: session,
      desktopUnlocked: false
    });

    this.attachProcess(process, session.id);
    this.startTicker();
    this.emitChanged();
  }

  async stopByAdmin(): Promise<void> {
    const state = this.storage.getState();
    const session = state.activeSession;
    if (!session) {
      return;
    }

    if (typeof session.pid === 'number') {
      await this.launcher.killProcessTree(session.pid).catch(() => undefined);
    }
    await this.finalize(session, 'admin-stop', new Date());
  }

  async finalizeIfProcessExited(): Promise<void> {
    const state = this.storage.getState();
    if (!state.activeSession) {
      return;
    }
    await this.finalize(state.activeSession, 'manual', new Date());
  }

  private async resumeExistingSession(game: ManagedGame, session: ActiveSession): Promise<void> {
    const remainingSeconds = this.calculateRemainingSeconds(session);
    if (remainingSeconds <= 0) {
      await this.finalizeRecoveredTimeout(session);
      return;
    }

    const process = await this.launcher.launch(game);
    const nextState = this.storage.getState();
    nextState.activeSession = {
      ...session,
      status: 'running',
      remainingSeconds,
      pid: process.pid
    };
    await this.storage.saveState(nextState);
    this.attachProcess(process, session.id);
    this.startTicker();
    this.emitChanged();
  }

  private attachProcess(process: ChildProcess, sessionId: string): void {
    this.activeProcess = process;
    process.once('exit', () => {
      if (this.finalizingSessionId === sessionId) {
        return;
      }
      void this.finalizeIfProcessExited();
    });
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
      if (typeof session.pid === 'number') {
        this.finalizingSessionId = session.id;
        await this.launcher.killProcessTree(session.pid).catch(() => undefined);
      }
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

  private async finalize(
    session: ActiveSession,
    reason: SessionExitReason,
    endedAt: Date
  ): Promise<void> {
    if (this.finalizingSessionId === session.id && reason === 'manual') {
      return;
    }

    this.finalizingSessionId = session.id;
    this.stopTicker();
    this.activeProcess = null;

    await this.normalizeUsageWindow();

    const config = this.storage.getConfig();
    const usage = this.storage.getUsage();
    const state = this.storage.getState();
    const fullBudgetSeconds = secondsBetween(session.startedAt, session.plannedEndAt);
    const actualSeconds =
      reason === 'timeout' || reason === 'expired-while-offline'
        ? fullBudgetSeconds
        : clamp(secondsBetween(session.startedAt, endedAt.toISOString()), 1, fullBudgetSeconds);

    const record: UsageRecord = {
      id: session.id,
      appId: session.appId,
      appName: session.appName,
      startedAt: session.startedAt,
      endedAt: endedAt.toISOString(),
      usedSeconds: actualSeconds,
      reason
    };

    const nextUsage: UsageLedger = {
      ...usage,
      usedSeconds: clamp(usage.usedSeconds + actualSeconds, 0, config.weeklyQuotaSeconds),
      sessions: [record, ...usage.sessions].slice(0, 32)
    };
    const nextState: PersistedState = {
      ...state,
      activeSession: null,
      lastSessionEndedAt: endedAt.toISOString(),
      cooldownUntil: new Date(endedAt.getTime() + config.minGapSeconds * 1000).toISOString()
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
      sessions: []
    });
  }

  private async normalizeCooldown(): Promise<void> {
    const state = this.storage.getState();
    if (!state.cooldownUntil) {
      return;
    }
    if (new Date(state.cooldownUntil).getTime() > Date.now()) {
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

