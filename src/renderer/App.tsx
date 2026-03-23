import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PasswordUpdateInput, PolicyUpdateInput, RendererSnapshot } from '../main/types';
import { AdminPanel } from './components/AdminPanel';
import { ChildSurface } from './components/ChildSurface';

export function App() {
  const [snapshot, setSnapshot] = useState<RendererSnapshot | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
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
    setAdminPromptOpen(false);
    setAdminAuthenticated(false);
    setPassword('');
    setAuthError('');
  }

  function openAdminEntry() {
    setAuthError('');
    setPassword('');
    setAdminPromptOpen(true);
  }

  function closeAdminPrompt() {
    setAdminPromptOpen(false);
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
    setAdminPromptOpen(false);
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
        onOpenAdmin={openAdminEntry}
        onStartSession={handleStartSession}
      />

      <AnimatePresence>
        {adminPromptOpen ? (
          <>
            <motion.div
              className="auth-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeAdminPrompt}
            />
            <motion.section
              className="auth-sheet"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.97 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="auth-sheet-header">
                <div>
                  <p className="eyebrow">Admin access</p>
                  <h2>Enter password</h2>
                </div>
                <button type="button" className="ghost-button" onClick={closeAdminPrompt}>
                  Close
                </button>
              </div>
              <p className="auth-copy">Open the control panel without leaving a permanent login box on the child screen.</p>
              <label className="auth-field">
                <span className="field-label">Password</span>
                <input
                  autoFocus
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
              <div className="auth-actions">
                <button type="button" onClick={() => void handleAdminLogin()}>
                  Unlock admin
                </button>
                {authError ? <p className="inline-error auth-error">{authError}</p> : null}
              </div>
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>

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