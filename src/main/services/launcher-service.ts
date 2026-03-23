import { spawn } from 'node:child_process';

export class LauncherService {
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
