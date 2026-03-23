import { app, BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { ControlCenter } from './services/control-center';
import { KioskService } from './services/kiosk-service';
import { registerIpc } from './ipc/register-ipc';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let allowWindowClose = false;

const kiosk = new KioskService();
const control = new ControlCenter();

function getCountdownSeconds(): number | null {
  const snapshot = control.getSnapshot();
  const activeSession = snapshot.state.activeSession;
  if (!activeSession || snapshot.state.desktopUnlocked) {
    return null;
  }

  return activeSession.remainingSeconds <= 60 ? activeSession.remainingSeconds : null;
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
  const width = 214;
  const height = 108;
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
    width: 214,
    height: 108,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
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
            pointer-events: none;
            width: 100%;
            display: grid;
            gap: 4px;
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
        </style>
      </head>
      <body>
        <div class="overlay">
          <div class="label">Session ending</div>
          <div id="time" class="time">1:00</div>
        </div>
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
  const countdownSeconds = getCountdownSeconds();
  if (countdownSeconds === null) {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.hide();
    }
    return;
  }

  const window = await ensureOverlayWindow();
  if (window.isDestroyed()) {
    return;
  }

  const countdownText = formatCountdown(countdownSeconds);
  await window.webContents.executeJavaScript(
    `document.getElementById('time').textContent = ${JSON.stringify(countdownText)};`,
    true
  );
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