/// <reference types="vite/client" />

import type { PasswordUpdateInput, PolicyUpdateInput, RendererSnapshot } from '../main/types';

declare global {
  interface Window {
    gametime: {
      load(): Promise<RendererSnapshot>;
      login(password: string): Promise<boolean>;
      updatePassword(input: PasswordUpdateInput): Promise<void>;
      updatePolicy(input: PolicyUpdateInput): Promise<void>;
      startSession(): Promise<void>;
      stopSession(): Promise<void>;
      unlockDesktop(): Promise<void>;
      subscribe(listener: (snapshot: RendererSnapshot) => void): () => void;
    };
  }
}

export {};
