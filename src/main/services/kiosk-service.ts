import { BrowserWindow, globalShortcut } from 'electron';

const ALWAYS_BLOCKED_SHORTCUTS = ['Alt+F4'];

const LOCKED_ONLY_SHORTCUTS = [
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
    this.registerAlwaysBlockedShortcuts();
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
      this.registerLockedShortcuts();
      return;
    }

    this.locked = true;
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setKiosk(true);
    window.show();
    window.focus();
    this.registerLockedShortcuts();
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
    this.unregisterLockedShortcuts();
    window.setKiosk(false);
    window.setAlwaysOnTop(false);
    window.setVisibleOnAllWorkspaces(false);
    window.minimize();
  }

  dispose(): void {
    this.unregisterAlwaysBlockedShortcuts();
    this.unregisterLockedShortcuts();
  }

  private registerAlwaysBlockedShortcuts(): void {
    for (const shortcut of ALWAYS_BLOCKED_SHORTCUTS) {
      if (!globalShortcut.isRegistered(shortcut)) {
        globalShortcut.register(shortcut, () => undefined);
      }
    }
  }

  private unregisterAlwaysBlockedShortcuts(): void {
    for (const shortcut of ALWAYS_BLOCKED_SHORTCUTS) {
      globalShortcut.unregister(shortcut);
    }
  }

  private registerLockedShortcuts(): void {
    for (const shortcut of LOCKED_ONLY_SHORTCUTS) {
      if (!globalShortcut.isRegistered(shortcut)) {
        globalShortcut.register(shortcut, () => undefined);
      }
    }
  }

  private unregisterLockedShortcuts(): void {
    for (const shortcut of LOCKED_ONLY_SHORTCUTS) {
      globalShortcut.unregister(shortcut);
    }
  }
}
