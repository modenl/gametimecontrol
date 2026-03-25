import { app, BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { ControlCenter } from './services/control-center';
import { KioskService } from './services/kiosk-service';
import { registerIpc } from './ipc/register-ipc';
import { GRACE_EXTENSION_MINUTES, WEEKLY_GRACE_EXTENSION_LIMIT } from './services/time';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let allowWindowClose = false;

const kiosk = new KioskService();
const control = new ControlCenter();

interface CountdownOverlayState {
  countdownText: string;
  label: string;
  helperText: string;
  canRequestGrace: boolean;
}

function getCountdownOverlayState(): CountdownOverlayState | null {
  const snapshot = control.getSnapshot();
  const activeSession = snapshot.state.activeSession;
  if (!activeSession || snapshot.state.desktopUnlocked || activeSession.remainingSeconds > 60) {
    return null;
  }

  const graceAlreadyUsed = activeSession.graceSecondsGranted > 0;
  const graceRemainingThisWeek = Math.max(0, WEEKLY_GRACE_EXTENSION_LIMIT - snapshot.usage.graceExtensionsUsed);

  return {
    countdownText: formatCountdown(activeSession.remainingSeconds),
    label: graceAlreadyUsed ? 'Grace time ending' : 'Session ending',
    helperText: graceAlreadyUsed
      ? 'Extra 5 minutes already used'
      : graceRemainingThisWeek > 0
        ? `${graceRemainingThisWeek} grace request${graceRemainingThisWeek === 1 ? '' : 's'} left this week`
        : 'No grace requests left this week',
    canRequestGrace: !graceAlreadyUsed && graceRemainingThisWeek > 0
  };
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function positionOverlayWindow(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const bounds = display.workArea;
  const width = 248;
  const height = 158;
  const margin = 18;

  overlayWindow.setBounds({
    x: bounds.x + bounds.width - width - margin,
    y: bounds.y + margin,
    width,
    height
  });
}

async function ensureOverlayWindow(): Promise<BrowserWindow> {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    positionOverlayWindow();
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: 248,
    height: 158,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  positionOverlayWindow();

  const overlayHtml = `
    <!doctype html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: transparent;
            font-family: 'Aptos Display', 'Segoe UI Variable Display', 'Segoe UI', sans-serif;
          }
          body {
            display: grid;
            place-items: start end;
          }
          .overlay {
            width: 100%;
            display: grid;
            gap: 6px;
            padding: 16px 18px;
            border-radius: 20px;
            background: rgba(6, 10, 14, 0.34);
            border: 1px solid rgba(149, 225, 255, 0.26);
            backdrop-filter: blur(16px);
            color: #f3f7fb;
            text-align: right;
            box-sizing: border-box;
          }
          .label {
            color: rgba(255, 255, 255, 0.72);
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-size: 11px;
          }
          .time {
            font-size: 42px;
            line-height: 1;
            font-weight: 700;
            letter-spacing: -0.05em;
          }
          .helper {
            color: rgba(255, 255, 255, 0.68);
            font-size: 12px;
            line-height: 1.35;
          }
          .button-row {
            display: flex;
            justify-content: flex-end;
            min-height: 36px;
          }
          .grace-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 9px 12px;
            border-radius: 999px;
            border: 1px solid rgba(160, 214, 255, 0.32);
            background: linear-gradient(135deg, rgba(140, 224, 255, 0.98) 0%, rgba(47, 167, 241, 0.98) 100%);
            color: #04111b;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
          }
          .grace-button[hidden] {
            display: none;
          }
          .grace-button:disabled {
            opacity: 0.6;
            cursor: wait;
          }
        </style>
      </head>
      <body>
        <div class="overlay">
          <div id="label" class="label">Session ending</div>
          <div id="time" class="time">1:00</div>
          <div id="helper" class="helper"></div>
          <div class="button-row">
            <button id="grace-button" class="grace-button" type="button">+${GRACE_EXTENSION_MINUTES} min</button>
          </div>
        </div>
        <script>
          const button = document.getElementById('grace-button');
          const helper = document.getElementById('helper');
          button.addEventListener('click', async () => {
            if (button.disabled) {
              return;
            }
            button.disabled = true;
            button.textContent = 'Adding...';
            try {
              await window.gametime.requestGraceExtension();
            } catch (error) {
              helper.textContent = error && error.message ? error.message : 'Unable to add time.';
              button.disabled = false;
              button.textContent = '+${GRACE_EXTENSION_MINUTES} min';
            }
          });
        </script>
      </body>
    </html>
  `;

  await overlayWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(overlayHtml)}`);
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

async function syncCountdownOverlay(): Promise<void> {
  const overlayState = getCountdownOverlayState();
  if (!overlayState) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    return;
  }

  const window = await ensureOverlayWindow();
  if (window.isDestroyed()) {
    return;
  }

  const payload = JSON.stringify(overlayState);
  await window.webContents.executeJavaScript(
    `(() => {
      const state = ${payload};
      document.getElementById('label').textContent = state.label;
      document.getElementById('time').textContent = state.countdownText;
      document.getElementById('helper').textContent = state.helperText;
      const button = document.getElementById('grace-button');
      button.hidden = !state.canRequestGrace;
      if (state.canRequestGrace) {
        button.disabled = false;
        button.textContent = '+${GRACE_EXTENSION_MINUTES} min';
      }
    })();`,
    true
  );
  window.setIgnoreMouseEvents(!overlayState.canRequestGrace, { forward: true });
  positionOverlayWindow();
  window.showInactive();
}

function syncWindowMode(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const snapshot = control.getSnapshot();
  if (snapshot.state.activeSession) {
    kiosk.releaseForSession();
  } else {
    kiosk.lockWindow();
  }

  void syncCountdownOverlay();
}

async function createWindow(): Promise<void> {
  await control.initialize();

  mainWindow = new BrowserWindow({
    width: 1600,
    height: 980,
    kiosk: true,
    fullscreen: true,
    alwaysOnTop: true,
    backgroundColor: '#070b11',
    autoHideMenuBar: true,
    frame: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    resizable: false,
    closable: true,
    title: 'Game Time Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  kiosk.bindWindow(mainWindow);
  registerIpc(control, mainWindow);
  control.on('changed', syncWindowMode);

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    syncWindowMode();
    mainWindow?.show();
    if (!control.getSnapshot().state.activeSession) {
      mainWindow?.focus();
    }
  });

  mainWindow.on('close', (event) => {
    if (allowWindowClose || control.getSnapshot().state.desktopUnlocked) {
      return;
    }

    event.preventDefault();
    syncWindowMode();
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.on('closed', () => {
    control.off('changed', syncWindowMode);
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
      overlayWindow = null;
    }
    mainWindow = null;
  });
}

app.on('before-quit', () => {
  allowWindowClose = true;
});

app.whenReady().then(() => {
  void createWindow();

  screen.on('display-metrics-changed', () => {
    positionOverlayWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  kiosk.dispose();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});