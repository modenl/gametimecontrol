import { BrowserWindow, globalShortcut, powerSaveBlocker } from 'electron';

const BLOCKED_SHORTCUTS = [
  'Alt+F4',
  'CommandOrControl+W',
  'CommandOrControl+Q',
  'Alt+Tab',
  'CommandOrControl+Escape',
  'CommandOrControl+Shift+Escape'
];

export class KioskService {
  private blockerId: number | null = null;

  bindWindow(window: BrowserWindow): void {
    this.ensurePowerBlocker();
    window.setMenuBarVisibility(false);
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setKiosk(true);

    window.on('blur', () => {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.show();
          window.focus();
        }
      }, 40);
    });

    window.on('leave-full-screen', () => {
      if (!window.isDestroyed()) {
        window.setKiosk(true);
      }
    });

    for (const shortcut of BLOCKED_SHORTCUTS) {
      globalShortcut.register(shortcut, () => undefined);
    }
  }

  dispose(): void {
    globalShortcut.unregisterAll();
    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
      powerSaveBlocker.stop(this.blockerId);
      this.blockerId = null;
    }
  }

  private ensurePowerBlocker(): void {
    if (this.blockerId !== null && powerSaveBlocker.isStarted(this.blockerId)) {
      return;
    }
    this.blockerId = powerSaveBlocker.start('prevent-display-sleep');
  }
}
