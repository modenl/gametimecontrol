import { app } from 'electron';
import { EventEmitter } from 'node:events';
import type {
  PasswordUpdateInput,
  PolicyUpdateInput,
  RendererSnapshot
} from '../types';
import { LauncherService } from './launcher-service';
import { SessionService } from './session-service';
import { StorageService } from './storage';

export class ControlCenter extends EventEmitter {
  readonly storage = new StorageService(app.getPath('userData'));

  readonly launcher = new LauncherService();

  readonly session = new SessionService(this.storage, this.launcher);

  async initialize(): Promise<void> {
    this.session.on('changed', () => this.emit('changed', this.getSnapshot()));
    await this.storage.initialize();
    await this.session.recover();
  }

  getSnapshot(): RendererSnapshot {
    return {
      config: this.storage.getRendererConfig(),
      state: this.storage.getState(),
      usage: this.storage.getUsage(),
      availability: this.session.getAvailability(),
      now: new Date().toISOString()
    };
  }

  login(password: string): boolean {
    return this.storage.verifyPassword(password);
  }

  async updatePassword(input: PasswordUpdateInput): Promise<void> {
    if (!this.storage.verifyPassword(input.currentPassword)) {
      throw new Error('Current password is incorrect.');
    }
    if (input.nextPassword.trim().length < 4) {
      throw new Error('New password must be at least 4 characters.');
    }
    await this.storage.updatePasswordHash(this.storage.hashPassword(input.nextPassword.trim()));
    this.emit('changed', this.getSnapshot());
  }

  async updatePolicy(input: PolicyUpdateInput): Promise<void> {
    const current = this.storage.getConfig();
    const next = {
      ...current,
      weeklyQuotaSeconds: Math.max(600, Math.round(input.weeklyQuotaMinutes * 60)),
      sessionMaxSeconds: Math.max(60, Math.round(input.sessionMaxMinutes * 60)),
      minGapSeconds: Math.max(300, Math.round(input.minGapHours * 3600)),
      managedGames: input.managedGames.map((game) => ({
        ...game,
        launchArgs: game.launchArgs ?? []
      })),
      install: input.install
    };
    await this.storage.saveConfig(next);
    this.emit('changed', this.getSnapshot());
  }

  async launchGame(gameId: string): Promise<void> {
    const game = this.storage
      .getConfig()
      .managedGames.find((item) => item.id === gameId && item.enabled);
    if (!game) {
      throw new Error('Game is not available.');
    }
    await this.session.startOrResume(game);
    this.emit('changed', this.getSnapshot());
  }

  async stopSession(): Promise<void> {
    await this.session.stopByAdmin();
    this.emit('changed', this.getSnapshot());
  }

  async unlockDesktop(): Promise<void> {
    const state = this.storage.getState();
    await this.storage.saveState({
      ...state,
      desktopUnlocked: true
    });
    await this.launcher.launchExplorer();
  }
}
