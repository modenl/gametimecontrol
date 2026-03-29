import { promises as fs } from 'node:fs';
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import type {
  ActiveSession,
  PersistedState,
  PolicyConfig,
  RendererConfig,
  UsageLedger
} from '../types';
import {
  DEFAULT_GRACE_SECONDS,
  MIN_GAP_SECONDS,
  SESSION_MAX_SECONDS,
  WEEKLY_QUOTA_SECONDS,
  getWeekStartLocal,
  secondsBetween
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
    this.state = this.normalizeState(await this.readOrCreate(this.statePath, this.createDefaultState()));
    this.usage = this.normalizeUsage(await this.readOrCreate(this.usagePath, this.createDefaultUsage()));
    await this.atomicWrite(this.configPath, this.config);
    await this.atomicWrite(this.statePath, this.state);
    await this.atomicWrite(this.usagePath, this.usage);
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

  getCountdownEvidenceDir(): string {
    return join(this.dataDir, 'countdown-evidence');
  }

  async saveConfig(next: PolicyConfig): Promise<void> {
    this.config = this.normalizeConfig(next);
    await this.atomicWrite(this.configPath, this.config);
  }

  async saveState(next: PersistedState): Promise<void> {
    this.state = this.normalizeState(next);
    await this.atomicWrite(this.statePath, this.state);
  }

  async saveUsage(next: UsageLedger): Promise<void> {
    this.usage = this.normalizeUsage(next);
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
      graceSeconds:
        typeof config.graceSeconds === 'number'
          ? config.graceSeconds
          : DEFAULT_GRACE_SECONDS,
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

  private normalizeState(raw: unknown): PersistedState {
    const state = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      activeSession: this.normalizeActiveSession(state.activeSession),
      cooldownUntil: typeof state.cooldownUntil === 'string' ? state.cooldownUntil : null,
      lastSessionEndedAt: typeof state.lastSessionEndedAt === 'string' ? state.lastSessionEndedAt : null,
      desktopUnlocked: Boolean(state.desktopUnlocked)
    };
  }

  private normalizeActiveSession(raw: unknown): ActiveSession | null {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const session = raw as Record<string, unknown>;
    if (typeof session.id !== 'string' || typeof session.startedAt !== 'string' || typeof session.plannedEndAt !== 'string') {
      return null;
    }

    const derivedBaseSeconds = secondsBetween(session.startedAt, session.plannedEndAt);

    return {
      id: session.id,
      startedAt: session.startedAt,
      plannedEndAt: session.plannedEndAt,
      remainingSeconds:
        typeof session.remainingSeconds === 'number' ? session.remainingSeconds : derivedBaseSeconds,
      baseDurationSeconds:
        typeof session.baseDurationSeconds === 'number' ? session.baseDurationSeconds : derivedBaseSeconds,
      graceSecondsGranted:
        typeof session.graceSecondsGranted === 'number' ? session.graceSecondsGranted : 0,
      status: 'running'
    };
  }

  private normalizeUsage(raw: unknown): UsageLedger {
    const usage = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      weekStart:
        typeof usage.weekStart === 'string'
          ? usage.weekStart
          : getWeekStartLocal(new Date()).toISOString(),
      usedSeconds: typeof usage.usedSeconds === 'number' ? usage.usedSeconds : 0,
      graceExtensionsUsed:
        typeof usage.graceExtensionsUsed === 'number' ? usage.graceExtensionsUsed : 0,
      graceSecondsGranted:
        typeof usage.graceSecondsGranted === 'number' ? usage.graceSecondsGranted : 0,
      sessions: Array.isArray(usage.sessions)
        ? usage.sessions.map((session) => {
            const item = session as Record<string, unknown>;
            return {
              id: typeof item.id === 'string' ? item.id : randomUUID(),
              startedAt: typeof item.startedAt === 'string' ? item.startedAt : new Date().toISOString(),
              endedAt: typeof item.endedAt === 'string' ? item.endedAt : new Date().toISOString(),
              usedSeconds: typeof item.usedSeconds === 'number' ? item.usedSeconds : 0,
              graceSecondsGranted:
                typeof item.graceSecondsGranted === 'number' ? item.graceSecondsGranted : 0,
              reason:
                item.reason === 'timeout' || item.reason === 'admin-stop' || item.reason === 'expired-while-offline'
                  ? item.reason
                  : 'admin-stop'
            };
          })
        : []
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
      graceSeconds: DEFAULT_GRACE_SECONDS,
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
      graceExtensionsUsed: 0,
      graceSecondsGranted: 0,
      sessions: []
    };
  }
}
