import { BrowserWindow, globalShortcut } from 'electron';

const BLOCKED_SHORTCUTS = [
  'Alt+F4',
  'CommandOrControl+W',
  'CommandOrControl+Q',
  'Alt+Tab',
  'CommandOrControl+Escape',
  'CommandOrControl+Shift+Escape'
];

export class KioskService {
  private locked = true;
  private boundWindow: BrowserWindow | null = null;

  bindWindow(window: BrowserWindow): void {
    this.boundWindow = window;
    window.setMenuBarVisibility(false);
    this.lockWindow();

    window.on('blur', () => {
      if (!this.locked) {
        return;
      }
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.show();
          window.focus();
        }
      }, 40);
    });

    window.on('leave-full-screen', () => {
      if (this.locked && !window.isDestroyed()) {
        window.setKiosk(true);
      }
    });
  }

  lockWindow(): void {
    const window = this.boundWindow;
    if (!window || window.isDestroyed()) {
      return;
    }

    if (this.locked) {
      window.setAlwaysOnTop(true, 'screen-saver');
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      return;
    }

    this.locked = true;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setKiosk(true);
    window.show();
    window.focus();
    this.registerShortcuts();
  }

  releaseForSession(): void {
    const window = this.boundWindow;
    if (!window || window.isDestroyed()) {
      return;
    }

    if (!this.locked) {
      return;
    }

    this.locked = false;
    this.unregisterShortcuts();
    window.setKiosk(false);
    window.setAlwaysOnTop(false);
    window.setVisibleOnAllWorkspaces(false);
    window.minimize();
  }

  dispose(): void {
    this.unregisterShortcuts();
  }

  private registerShortcuts(): void {
    for (const shortcut of BLOCKED_SHORTCUTS) {
      if (!globalShortcut.isRegistered(shortcut)) {
        globalShortcut.register(shortcut, () => undefined);
      }
    }
  }

  private unregisterShortcuts(): void {
    globalShortcut.unregisterAll();
  }
}