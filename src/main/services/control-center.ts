import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { EventEmitter } from 'node:events';
import type {
  CountdownEvidenceImage,
  CountdownEvidenceSession,
  PasswordUpdateInput,
  PolicyUpdateInput,
  RendererSnapshot
} from '../types';
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
      weeklyQuotaSeconds: Math.max(60, Math.round(input.weeklyQuotaMinutes * 60)),
      sessionMaxSeconds: Math.max(1, Math.round(input.sessionMaxMinutes * 60)),
      graceSeconds: Math.max(0, Math.round(input.graceMinutes * 60)),
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

  async listCountdownEvidence(): Promise<CountdownEvidenceSession[]> {
    const rootDir = this.storage.getCountdownEvidenceDir();

    let sessionDirs: Dirent[] = [];
    try {
      sessionDirs = await fs.readdir(rootDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const sessions = await Promise.all(
      sessionDirs
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const sessionId = entry.name;
          const sessionDir = join(rootDir, sessionId);

          let files: Dirent[] = [];
          try {
            files = await fs.readdir(sessionDir, { withFileTypes: true });
          } catch {
            return null;
          }

          const images = (
            await Promise.all(
              files
                .filter((file) => file.isFile() && file.name.toLowerCase().endsWith('.png'))
                .map(async (file) => this.readEvidenceImage(sessionId, sessionDir, file.name))
            )
          ).filter((image): image is CountdownEvidenceImage => Boolean(image));

          if (images.length === 0) {
            return null;
          }

          images.sort((left, right) => {
            if (left.shotNumber !== right.shotNumber) {
              return left.shotNumber - right.shotNumber;
            }
            return left.capturedAt.localeCompare(right.capturedAt);
          });

          const capturedAt = [...images]
            .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))[0]
            .capturedAt;

          return {
            sessionId,
            capturedAt,
            imageCount: images.length,
            images
          } satisfies CountdownEvidenceSession;
        })
    );

    return sessions
      .filter((session): session is CountdownEvidenceSession => Boolean(session))
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
  }

  private async readEvidenceImage(
    sessionId: string,
    sessionDir: string,
    fileName: string
  ): Promise<CountdownEvidenceImage | null> {
    const filePath = join(sessionDir, fileName);

    try {
      const stat = await fs.stat(filePath);
      const shotMatch = fileName.match(/-shot-(\d+)\.png$/i);

      return {
        id: `${sessionId}:${fileName}`,
        sessionId,
        shotNumber: shotMatch ? Number(shotMatch[1]) : 0,
        capturedAt: stat.mtime.toISOString(),
        filePath,
        fileUrl: pathToFileURL(filePath).toString()
      };
    } catch {
      return null;
    }
  }
}
