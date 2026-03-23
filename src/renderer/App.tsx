import { useEffect, useState } from 'react';
import type { PasswordUpdateInput, PolicyUpdateInput, RendererSnapshot } from '../main/types';
import { AdminPanel } from './components/AdminPanel';
import { ChildSurface } from './components/ChildSurface';

export function App() {
  const [snapshot, setSnapshot] = useState<RendererSnapshot | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [busyMessage, setBusyMessage] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    void window.gametime.load().then(setSnapshot);
    unsubscribe = window.gametime.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  function closeAdminPanel() {
    setAdminOpen(false);
    setAdminAuthenticated(false);
    setPassword('');
    setAuthError('');
  }

  async function handleAdminLogin() {
    setAuthError('');
    const success = await window.gametime.login(password);
    if (!success) {
      setAuthError('Password incorrect.');
      return;
    }
    setAdminAuthenticated(true);
    setAdminOpen(true);
    setPassword('');
  }

  async function wrapAction(message: string, action: () => Promise<void>) {
    setBusyMessage(message);
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unexpected error.');
    } finally {
      setBusyMessage('');
    }
  }

  async function handlePolicySave(input: PolicyUpdateInput) {
    await wrapAction('Saving settings...', () => window.gametime.updatePolicy(input));
  }

  async function handlePasswordSave(input: PasswordUpdateInput) {
    await wrapAction('Updating password...', () => window.gametime.updatePassword(input));
  }

  async function handleStartSession() {
    await wrapAction('Starting session and unlocking the desktop...', () => window.gametime.startSession());
  }

  async function handleStopSession() {
    await wrapAction('Stopping session...', () => window.gametime.stopSession());
  }

  async function handleUnlockDesktop() {
    await wrapAction('Unlocking desktop...', () => window.gametime.unlockDesktop());
  }

  if (!snapshot) {
    return <div className="boot-screen">Loading control surface...</div>;
  }

  return (
    <div className="app-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />
      <ChildSurface
        snapshot={snapshot}
        busyMessage={busyMessage}
        actionError={actionError}
        onOpenAdmin={() => setAdminOpen(true)}
        onStartSession={handleStartSession}
      />

      <div className="admin-gate">
        {!adminAuthenticated ? (
          <div className="admin-login">
            <label>
              <span>Admin</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleAdminLogin();
                  }
                }}
              />
            </label>
            <button type="button" onClick={() => void handleAdminLogin()}>
              Unlock
            </button>
            {authError ? <p className="inline-error">{authError}</p> : null}
          </div>
        ) : (
          <button type="button" className="admin-open-button" onClick={() => setAdminOpen(true)}>
            Admin Panel
          </button>
        )}
      </div>

      <AdminPanel
        snapshot={snapshot}
        open={adminOpen && adminAuthenticated}
        busyMessage={busyMessage}
        actionError={actionError}
        onClose={closeAdminPanel}
        onSavePolicy={handlePolicySave}
        onSavePassword={handlePasswordSave}
        onStopSession={handleStopSession}
        onUnlockDesktop={handleUnlockDesktop}
      />
    </div>
  );
}