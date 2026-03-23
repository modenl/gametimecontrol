import { promises as fs } from 'node:fs';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import type {
  PersistedState,
  PolicyConfig,
  RendererConfig,
  UsageLedger
} from '../types';
import {
  MIN_GAP_SECONDS,
  SESSION_MAX_SECONDS,
  WEEKLY_QUOTA_SECONDS,
  getWeekStartLocal
} from './time';

function createPasswordHash(password: string): string {
  const salt = randomUUID().replaceAll('-', '');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPasswordHash(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) {
    return false;
  }

  const nextHash = scryptSync(password, salt, 64);
  const currentHash = Buffer.from(hash, 'hex');
  return currentHash.length === nextHash.length && timingSafeEqual(currentHash, nextHash);
}

export class StorageService {
  private readonly dataDir: string;
  private readonly configPath: string;
  private readonly statePath: string;
  private readonly usagePath: string;
  private config!: PolicyConfig;
  private state!: PersistedState;
  private usage!: UsageLedger;

  constructor(baseDir: string) {
    this.dataDir = join(baseDir, 'control-data');
    this.configPath = join(this.dataDir, 'config.json');
    this.statePath = join(this.dataDir, 'state.json');
    this.usagePath = join(this.dataDir, 'usage.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    const defaultConfig = this.createDefaultConfig();
    this.config = this.normalizeConfig(await this.readOrCreate(this.configPath, defaultConfig));
    this.state = await this.readOrCreate(this.statePath, this.createDefaultState());
    this.usage = await this.readOrCreate(this.usagePath, this.createDefaultUsage());
    await this.atomicWrite(this.configPath, this.config);
  }

  getConfig(): PolicyConfig {
    return structuredClone(this.config);
  }

  getRendererConfig(): RendererConfig {
    const { adminPasswordHash: _hidden, ...config } = this.config;
    return structuredClone(config);
  }

  getState(): PersistedState {
    return structuredClone(this.state);
  }

  getUsage(): UsageLedger {
    return structuredClone(this.usage);
  }

  async saveConfig(next: PolicyConfig): Promise<void> {
    this.config = this.normalizeConfig(next);
    await this.atomicWrite(this.configPath, this.config);
  }

  async saveState(next: PersistedState): Promise<void> {
    this.state = structuredClone(next);
    await this.atomicWrite(this.statePath, this.state);
  }

  async saveUsage(next: UsageLedger): Promise<void> {
    this.usage = structuredClone(next);
    await this.atomicWrite(this.usagePath, this.usage);
  }

  async updatePasswordHash(nextHash: string): Promise<void> {
    this.config.adminPasswordHash = nextHash;
    await this.atomicWrite(this.configPath, this.config);
  }

  hashPassword(password: string): string {
    return createPasswordHash(password);
  }

  verifyPassword(password: string): boolean {
    return verifyPasswordHash(password, this.config.adminPasswordHash);
  }

  private normalizeConfig(raw: unknown): PolicyConfig {
    const config = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const legacyInstall =
      config.install && typeof config.install === 'object'
        ? (config.install as Record<string, unknown>)
        : {};

    return {
      adminPasswordHash:
        typeof config.adminPasswordHash === 'string' && config.adminPasswordHash
          ? config.adminPasswordHash
          : createPasswordHash('qwert'),
      weeklyQuotaSeconds:
        typeof config.weeklyQuotaSeconds === 'number'
          ? config.weeklyQuotaSeconds
          : WEEKLY_QUOTA_SECONDS,
      sessionMaxSeconds:
        typeof config.sessionMaxSeconds === 'number'
          ? config.sessionMaxSeconds
          : SESSION_MAX_SECONDS,
      minGapSeconds:
        typeof config.minGapSeconds === 'number' ? config.minGapSeconds : MIN_GAP_SECONDS,
      childProfile: {
        displayName:
          config.childProfile &&
          typeof config.childProfile === 'object' &&
          typeof (config.childProfile as Record<string, unknown>).displayName === 'string'
            ? ((config.childProfile as Record<string, unknown>).displayName as string)
            : typeof legacyInstall.childAccountName === 'string'
              ? legacyInstall.childAccountName
              : 'Child'
      }
    };
  }

  private async readOrCreate<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch {
      await this.atomicWrite(filePath, fallback);
      return structuredClone(fallback);
    }
  }

  private async atomicWrite(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
    await fs.rename(tempPath, filePath);
  }

  private createDefaultConfig(): PolicyConfig {
    return {
      adminPasswordHash: createPasswordHash('qwert'),
      weeklyQuotaSeconds: WEEKLY_QUOTA_SECONDS,
      sessionMaxSeconds: SESSION_MAX_SECONDS,
      minGapSeconds: MIN_GAP_SECONDS,
      childProfile: {
        displayName: 'Child'
      }
    };
  }

  private createDefaultState(): PersistedState {
    return {
      activeSession: null,
      cooldownUntil: null,
      lastSessionEndedAt: null,
      desktopUnlocked: false
    };
  }

  private createDefaultUsage(): UsageLedger {
    return {
      weekStart: getWeekStartLocal(new Date()).toISOString(),
      usedSeconds: 0,
      sessions: []
    };
  }
}
