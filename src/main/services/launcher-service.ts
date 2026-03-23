import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { ManagedGame } from '../types';

export class LauncherService {
  async launch(game: ManagedGame): Promise<ChildProcess> {
    const child = spawn(game.exePath, game.launchArgs, {
      cwd: game.workingDir || dirname(game.exePath),
      detached: false,
      shell: false,
      stdio: 'ignore',
      windowsHide: false
    });

    child.unref();
    return child;
  }

  async killProcessTree(pid: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        shell: false,
        windowsHide: true,
        stdio: 'ignore'
      });
      killer.once('error', reject);
      killer.once('exit', (code) => {
        if (code === 0 || code === 128 || code === 255) {
          resolve();
          return;
        }
        reject(new Error(`taskkill exited with code ${String(code)}`));
      });
    });
  }

  async launchExplorer(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const process = spawn('explorer.exe', [], {
        detached: true,
        shell: false,
        stdio: 'ignore',
        windowsHide: false
      });
      process.once('error', reject);
      process.once('spawn', () => resolve());
      process.unref();
    });
  }
}
