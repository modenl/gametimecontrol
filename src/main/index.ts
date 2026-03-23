import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { ControlCenter } from './services/control-center';
import { KioskService } from './services/kiosk-service';
import { registerIpc } from './ipc/register-ipc';

let mainWindow: BrowserWindow | null = null;

const kiosk = new KioskService();
const control = new ControlCenter();

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

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

app.whenReady().then(() => {
  void createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  kiosk.dispose();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

