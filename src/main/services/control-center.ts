import { app } from 'electron';
import { EventEmitter } from 'node:events';
import type { PasswordUpdateInput, PolicyUpdateInput, RendererSnapshot } from '../types';
import { SessionService } from './session-service';
import { StorageService } from './storage';

export class ControlCenter extends EventEmitter {
  readonly storage = new StorageService(app.getPath('userData'));
  readonly session = new SessionService(this.storage);

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
      minGapSeconds: Math.max(0, Math.round(input.minGapHours * 3600)),
      childProfile: {
        displayName: input.childProfile.displayName.trim() || 'Child'
      }
    };

    await this.storage.saveConfig(next);
    await this.session.syncDerivedState();
  }

  async startSession(): Promise<void> {
    await this.session.startSession();
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
  }
}