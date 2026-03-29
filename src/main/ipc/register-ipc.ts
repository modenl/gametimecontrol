import { BrowserWindow, ipcMain } from 'electron';
import type { ControlCenter } from '../services/control-center';
import type { PasswordUpdateInput, PolicyUpdateInput } from '../types';

export function registerIpc(control: ControlCenter, window: BrowserWindow): void {
  ipcMain.handle('bootstrap:load', () => control.getSnapshot());
  ipcMain.handle('auth:login', (_event, password: string) => control.login(password));
  ipcMain.handle('auth:updatePassword', (_event, input: PasswordUpdateInput) =>
    control.updatePassword(input)
  );
  ipcMain.handle('policy:update', (_event, input: PolicyUpdateInput) => control.updatePolicy(input));
  ipcMain.handle('session:start', () => control.startSession());
  ipcMain.handle('session:stop', () => control.stopSession());
  ipcMain.handle('evidence:list', () => control.listCountdownEvidence());
  ipcMain.handle('admin:unlockDesktop', async () => {
    await control.unlockDesktop();
    window.close();
  });

  const pushState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('state:changed', control.getSnapshot());
    }
  };

  control.on('changed', pushState);
  window.on('closed', () => {
    control.off('changed', pushState);
    ipcMain.removeHandler('bootstrap:load');
    ipcMain.removeHandler('auth:login');
    ipcMain.removeHandler('auth:updatePassword');
    ipcMain.removeHandler('policy:update');
    ipcMain.removeHandler('session:start');
    ipcMain.removeHandler('session:stop');
    ipcMain.removeHandler('evidence:list');
    ipcMain.removeHandler('admin:unlockDesktop');
  });
}
