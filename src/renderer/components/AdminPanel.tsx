import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  ManagedGame,
  PasswordUpdateInput,
  PolicyUpdateInput,
  RendererSnapshot
} from '../../main/types';

interface AdminPanelProps {
  snapshot: RendererSnapshot;
  open: boolean;
  busyMessage: string;
  actionError: string;
  onClose: () => void;
  onSavePolicy: (input: PolicyUpdateInput) => Promise<void>;
  onSavePassword: (input: PasswordUpdateInput) => Promise<void>;
  onStopSession: () => Promise<void>;
  onUnlockDesktop: () => Promise<void>;
}

function toArgs(value: string): string[] {
  return value
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);
}

function argsToString(value: string[]): string {
  return value.join(' ');
}

function createEmptyGame(): ManagedGame {
  return {
    id: crypto.randomUUID(),
    name: 'New game',
    exePath: '',
    launchArgs: [],
    enabled: true,
    workingDir: ''
  };
}

export function AdminPanel({
  snapshot,
  open,
  busyMessage,
  actionError,
  onClose,
  onSavePolicy,
  onSavePassword,
  onStopSession,
  onUnlockDesktop
}: AdminPanelProps) {
  const [quotaMinutes, setQuotaMinutes] = useState(120);
  const [sessionMinutes, setSessionMinutes] = useState(40);
  const [gapHours, setGapHours] = useState(4);
  const [childAccountName, setChildAccountName] = useState('');
  const [shellReplacementEnabled, setShellReplacementEnabled] = useState(false);
  const [startupRegistered, setStartupRegistered] = useState(false);
  const [games, setGames] = useState<ManagedGame[]>([]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    setQuotaMinutes(Math.round(snapshot.config.weeklyQuotaSeconds / 60));
    setSessionMinutes(Math.round(snapshot.config.sessionMaxSeconds / 60));
    setGapHours(Math.round(snapshot.config.minGapSeconds / 3600));
    setChildAccountName(snapshot.config.install.childAccountName);
    setShellReplacementEnabled(snapshot.config.install.shellReplacementEnabled);
    setStartupRegistered(snapshot.config.install.startupRegistered);
    setGames(snapshot.config.managedGames);
  }, [snapshot]);

  const canSave = useMemo(() => games.every((game) => Boolean(game.name.trim()) && Boolean(game.exePath.trim())), [games]);

  async function handleSave() {
    setSaveStatus('Saving...');
    await onSavePolicy({
      weeklyQuotaMinutes: quotaMinutes,
      sessionMaxMinutes: sessionMinutes,
      minGapHours: gapHours,
      managedGames: games,
      install: {
        childAccountName,
        shellReplacementEnabled,
        startupRegistered
      }
    });
    setSaveStatus('Saved.');
  }

  async function handlePasswordSave() {
    setPasswordStatus('Saving...');
    await onSavePassword({ currentPassword, nextPassword });
    setCurrentPassword('');
    setNextPassword('');
    setPasswordStatus('Password updated.');
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div className="admin-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside
            className="admin-panel"
            initial={{ x: 640, opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 640, opacity: 0.4 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          >
            <header className="admin-header">
              <div>
                <p className="eyebrow">Admin mode</p>
                <h2>Control settings</h2>
              </div>
              <button type="button" className="ghost-button" onClick={onClose}>
                Close
              </button>
            </header>

            <section className="admin-section split-grid">
              <div>
                <span className="field-label">Weekly quota (minutes)</span>
                <input type="number" min={10} value={quotaMinutes} onChange={(event) => setQuotaMinutes(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Session max (minutes)</span>
                <input type="number" min={1} value={sessionMinutes} onChange={(event) => setSessionMinutes(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Gap between sessions (hours)</span>
                <input type="number" min={1} value={gapHours} onChange={(event) => setGapHours(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Child account</span>
                <input value={childAccountName} onChange={(event) => setChildAccountName(event.target.value)} placeholder="Child Windows username" />
              </div>
            </section>

            <section className="admin-section toggle-row">
              <label>
                <input type="checkbox" checked={shellReplacementEnabled} onChange={(event) => setShellReplacementEnabled(event.target.checked)} />
                <span>Use app as child shell</span>
              </label>
              <label>
                <input type="checkbox" checked={startupRegistered} onChange={(event) => setStartupRegistered(event.target.checked)} />
                <span>Register startup</span>
              </label>
            </section>

            <section className="admin-section">
              <div className="section-header compact">
                <div>
                  <p className="eyebrow">Library</p>
                  <h3>Approved executables</h3>
                </div>
                <button type="button" className="ghost-button" onClick={() => setGames((current) => [...current, createEmptyGame()])}>
                  Add game
                </button>
              </div>

              <div className="admin-game-list">
                {games.map((game) => (
                  <div className="admin-game-row" key={game.id}>
                    <input value={game.name} placeholder="Name" onChange={(event) => setGames((current) => current.map((item) => item.id === game.id ? { ...item, name: event.target.value } : item))} />
                    <input value={game.exePath} placeholder="C:\\Games\\Example\\game.exe" onChange={(event) => setGames((current) => current.map((item) => item.id === game.id ? { ...item, exePath: event.target.value } : item))} />
                    <input value={argsToString(game.launchArgs)} placeholder="Launch args" onChange={(event) => setGames((current) => current.map((item) => item.id === game.id ? { ...item, launchArgs: toArgs(event.target.value) } : item))} />
                    <label className="checkbox-label">
                      <input type="checkbox" checked={game.enabled} onChange={(event) => setGames((current) => current.map((item) => item.id === game.id ? { ...item, enabled: event.target.checked } : item))} />
                      Enabled
                    </label>
                    <button type="button" className="danger-link" onClick={() => setGames((current) => current.filter((item) => item.id !== game.id))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="admin-section split-grid password-grid">
              <div>
                <span className="field-label">Current password</span>
                <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
              </div>
              <div>
                <span className="field-label">New password</span>
                <input type="password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
              </div>
              <div className="password-actions">
                <button type="button" className="ghost-button" onClick={() => void handlePasswordSave()}>
                  Update password
                </button>
                {passwordStatus ? <span className="status-chip">{passwordStatus}</span> : null}
              </div>
            </section>

            <section className="admin-section action-row">
              <button type="button" disabled={!canSave} onClick={() => void handleSave()}>
                Save settings
              </button>
              <button type="button" className="ghost-button" onClick={() => void onStopSession()}>
                Stop current session
              </button>
              <button type="button" className="danger-button" onClick={() => void onUnlockDesktop()}>
                Exit app to desktop
              </button>
            </section>

            {busyMessage || saveStatus || actionError ? (
              <footer className="admin-footer">
                {busyMessage ? <span className="status-chip">{busyMessage}</span> : null}
                {saveStatus ? <span className="status-chip">{saveStatus}</span> : null}
                {actionError ? <span className="inline-error">{actionError}</span> : null}
              </footer>
            ) : null}
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

