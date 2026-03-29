import { contextBridge, ipcRenderer } from 'electron';
import type {
  CountdownEvidenceSession,
  PasswordUpdateInput,
  PolicyUpdateInput,
  RendererSnapshot
} from '../main/types';

export interface GameTimeControlApi {
  load(): Promise<RendererSnapshot>;
  login(password: string): Promise<boolean>;
  updatePassword(input: PasswordUpdateInput): Promise<void>;
  updatePolicy(input: PolicyUpdateInput): Promise<void>;
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  listCountdownEvidence(): Promise<CountdownEvidenceSession[]>;
  unlockDesktop(): Promise<void>;
  subscribe(listener: (snapshot: RendererSnapshot) => void): () => void;
}

const api: GameTimeControlApi = {
  load: () => ipcRenderer.invoke('bootstrap:load'),
  login: (password) => ipcRenderer.invoke('auth:login', password),
  updatePassword: (input) => ipcRenderer.invoke('auth:updatePassword', input),
  updatePolicy: (input) => ipcRenderer.invoke('policy:update', input),
  startSession: () => ipcRenderer.invoke('session:start'),
  stopSession: () => ipcRenderer.invoke('session:stop'),
  listCountdownEvidence: () => ipcRenderer.invoke('evidence:list'),
  unlockDesktop: () => ipcRenderer.invoke('admin:unlockDesktop'),
  subscribe: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, snapshot: RendererSnapshot) =>
      listener(snapshot);
    ipcRenderer.on('state:changed', wrapped);
    return () => {
      ipcRenderer.removeListener('state:changed', wrapped);
    };
  }
};

contextBridge.exposeInMainWorld('gametime', api);
