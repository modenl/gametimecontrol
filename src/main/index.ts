import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { app, BrowserWindow, desktopCapturer, screen } from 'electron';
import { join } from 'node:path';
import { ControlCenter } from './services/control-center';
import { KioskService } from './services/kiosk-service';
import { registerIpc } from './ipc/register-ipc';

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let allowWindowClose = false;
let graceAlarmInterval: NodeJS.Timeout | null = null;
let countdownEvidenceSessionId: string | null = null;
let countdownEvidenceTimers: NodeJS.Timeout[] = [];

const kiosk = new KioskService();
const control = new ControlCenter();
const COUNTDOWN_EVIDENCE_SHOTS = 3;
const COUNTDOWN_EVIDENCE_INTERVAL_MS = 3000;

interface CountdownOverlayState {
  countdownText: string;
  label: string;
  helperText: string;
}

function formatMinutesValue(minutes: number): string {
  const rounded = Math.round(minutes * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(1)}`;
}

function getCountdownOverlayState(): CountdownOverlayState | null {
  const snapshot = control.getSnapshot();
  const activeSession = snapshot.state.activeSession;
  if (!activeSession || snapshot.state.desktopUnlocked || activeSession.graceSecondsGranted <= 0) {
    return null;
  }

  const inGracePeriod = activeSession.remainingSeconds <= activeSession.graceSecondsGranted;
  if (!inGracePeriod) {
    return null;
  }

  const graceMinutes = activeSession.graceSecondsGranted / 60;

  return {
    countdownText: formatCountdown(activeSession.remainingSeconds),
    label: 'Grace countdown',
    helperText: `Finish now. The app will lock again when this ${formatMinutesValue(graceMinutes)}-minute countdown ends.`
  };
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function getEvidenceRootDir(): string {
  return join(app.getPath('userData'), 'control-data', 'countdown-evidence');
}

function clearCountdownEvidenceSchedule(resetSessionId = true): void {
  for (const timer of countdownEvidenceTimers) {
    clearTimeout(timer);
  }
  countdownEvidenceTimers = [];
  if (resetSessionId) {
    countdownEvidenceSessionId = null;
  }
}

async function captureCountdownEvidence(sessionId: string, shotNumber: number): Promise<void> {
  const snapshot = control.getSnapshot();
  const activeSession = snapshot.state.activeSession;
  if (!activeSession || activeSession.id !== sessionId || activeSession.graceSecondsGranted <= 0) {
    return;
  }

  if (activeSession.remainingSeconds > activeSession.graceSecondsGranted) {
    return;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.max(1, primaryDisplay.size.width),
      height: Math.max(1, primaryDisplay.size.height)
    },
    fetchWindowIcons: false
  });

  const preferredSource =
    sources.find((source) => source.display_id === String(primaryDisplay.id)) ?? sources[0];

  if (!preferredSource || preferredSource.thumbnail.isEmpty()) {
    return;
  }

  const evidenceDir = join(getEvidenceRootDir(), sessionId);
  await fs.mkdir(evidenceDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(evidenceDir, `${timestamp}-shot-${shotNumber}.png`);
  await fs.writeFile(filePath, preferredSource.thumbnail.toPNG());
}

function scheduleCountdownEvidence(sessionId: string): void {
  if (countdownEvidenceSessionId === sessionId) {
    return;
  }

  clearCountdownEvidenceSchedule(false);
  countdownEvidenceSessionId = sessionId;

  for (let index = 0; index < COUNTDOWN_EVIDENCE_SHOTS; index += 1) {
    const timer = setTimeout(() => {
      void captureCountdownEvidence(sessionId, index + 1);
    }, index * COUNTDOWN_EVIDENCE_INTERVAL_MS);
    countdownEvidenceTimers.push(timer);
  }
}

function syncCountdownEvidence(): void {
  const snapshot = control.getSnapshot();
  const activeSession = snapshot.state.activeSession;

  if (
    !activeSession ||
    snapshot.state.desktopUnlocked ||
    activeSession.graceSecondsGranted <= 0 ||
    activeSession.remainingSeconds > activeSession.graceSecondsGranted
  ) {
    clearCountdownEvidenceSchedule();
    return;
  }

  scheduleCountdownEvidence(activeSession.id);
}

function playWindowsSystemAlert(): void {
  execFile(
    'powershell.exe',
    [
      '-NoProfile',
      '-WindowStyle',
      'Hidden',
      '-Command',
      "[System.Media.SystemSounds]::Exclamation.Play(); Start-Sleep -Milliseconds 180; [System.Media.SystemSounds]::Hand.Play()"
    ],
    { windowsHide: true },
    () => undefined
  );
}

function playGraceAlarmOnce(): void {
  playWindowsSystemAlert();

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  void overlayWindow.webContents
    .executeJavaScript('window.__playGraceAlarm?.()', true)
    .catch(() => undefined);
}

function syncGraceAlarm(active: boolean): void {
  if (!active) {
    if (graceAlarmInterval) {
      clearInterval(graceAlarmInterval);
      graceAlarmInterval = null;
    }
    return;
  }

  if (graceAlarmInterval) {
    return;
  }

  playGraceAlarmOnce();
  graceAlarmInterval = setInterval(() => {
    playGraceAlarmOnce();
  }, 8000);
}

function positionOverlayWindow(): void {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const display = screen.getPrimaryDisplay();
  const bounds = display.workArea;
  const width = 278;
  const height = 156;
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
    width: 278,
    height: 156,
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
            width: 100%;
            display: grid;
            gap: 8px;
            padding: 16px 18px;
            border-radius: 20px;
            background: rgba(29, 8, 8, 0.58);
            border: 1px solid rgba(255, 113, 113, 0.46);
            backdrop-filter: blur(16px);
            color: #fff4f4;
            text-align: right;
            box-sizing: border-box;
            animation: pulse 0.85s ease-in-out infinite alternate;
          }
          .label {
            color: rgba(255, 220, 220, 0.82);
            text-transform: uppercase;
            letter-spacing: 0.16em;
            font-size: 11px;
          }
          .time {
            font-size: 48px;
            line-height: 1;
            font-weight: 800;
            letter-spacing: -0.06em;
            animation: blink 0.9s step-end infinite;
          }
          .helper {
            color: rgba(255, 234, 234, 0.84);
            font-size: 12px;
            line-height: 1.4;
          }
          @keyframes pulse {
            from {
              transform: scale(1);
              box-shadow: 0 0 0 rgba(255, 78, 78, 0.16);
              background: rgba(29, 8, 8, 0.52);
            }
            to {
              transform: scale(1.035);
              box-shadow: 0 0 28px rgba(255, 78, 78, 0.3);
              background: rgba(66, 12, 12, 0.78);
            }
          }
          @keyframes blink {
            50% {
              opacity: 0.28;
            }
          }
        </style>
      </head>
      <body>
        <div class="overlay">
          <div id="label" class="label">Grace countdown</div>
          <div id="time" class="time">5:00</div>
          <div id="helper" class="helper">Finish now.</div>
        </div>
        <script>
          let audioContext;
          window.__playGraceAlarm = async () => {
            try {
              const Context = window.AudioContext || window.webkitAudioContext;
              if (!Context) {
                return;
              }
              audioContext = audioContext || new Context();
              if (audioContext.state === 'suspended') {
                await audioContext.resume();
              }
              const pattern = [
                { frequency: 880, delay: 0, duration: 0.14 },
                { frequency: 1174, delay: 0.2, duration: 0.16 },
                { frequency: 988, delay: 0.44, duration: 0.24 }
              ];
              const start = audioContext.currentTime + 0.02;
              for (const tone of pattern) {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                oscillator.type = 'square';
                oscillator.frequency.value = tone.frequency;
                gain.gain.setValueAtTime(0.0001, start + tone.delay);
                gain.gain.exponentialRampToValueAtTime(0.12, start + tone.delay + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.delay + tone.duration);
                oscillator.connect(gain);
                gain.connect(audioContext.destination);
                oscillator.start(start + tone.delay);
                oscillator.stop(start + tone.delay + tone.duration + 0.03);
              }
            } catch {
              // Ignore audio errors and keep the visual countdown running.
            }
          };
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
    syncGraceAlarm(false);
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
    })();`,
    true
  );

  positionOverlayWindow();
  window.showInactive();
  syncGraceAlarm(true);
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

  syncCountdownEvidence();
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
    clearCountdownEvidenceSchedule();
    syncGraceAlarm(false);
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
  clearCountdownEvidenceSchedule();
  syncGraceAlarm(false);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
