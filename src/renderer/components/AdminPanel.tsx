import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PasswordUpdateInput, PolicyUpdateInput, RendererSnapshot } from '../../main/types';

const GRACE_EXTENSION_MINUTES = 5;
const WEEKLY_GRACE_EXTENSION_LIMIT = 3;

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
  const [childDisplayName, setChildDisplayName] = useState('Child');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    setQuotaMinutes(Math.round(snapshot.config.weeklyQuotaSeconds / 60));
    setSessionMinutes(Math.round(snapshot.config.sessionMaxSeconds / 60));
    setGapHours(Math.round(snapshot.config.minGapSeconds / 3600));
    setChildDisplayName(snapshot.config.childProfile.displayName);
  }, [snapshot]);

  async function handleSave() {
    setSaveStatus('Saving...');
    await onSavePolicy({
      weeklyQuotaMinutes: quotaMinutes,
      sessionMaxMinutes: sessionMinutes,
      minGapHours: gapHours,
      childProfile: {
        displayName: childDisplayName
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
                <input type="number" min={0} value={gapHours} onChange={(event) => setGapHours(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Child profile name</span>
                <input value={childDisplayName} onChange={(event) => setChildDisplayName(event.target.value)} placeholder="Child" />
              </div>
            </section>

            <section className="admin-section">
              <div className="section-header compact">
                <div>
                  <p className="eyebrow">Simplified play flow</p>
                  <h3>Finish-up grace time</h3>
                </div>
              </div>
              <p className="empty-copy">
                During the last minute, the child can tap a one-time +{GRACE_EXTENSION_MINUTES} minute finish-up button. It follows the honor system and does not count against the weekly quota.
              </p>
              <div className="admin-inline-status">
                <span className="status-chip">Grace used this week: {snapshot.usage.graceExtensionsUsed} / {WEEKLY_GRACE_EXTENSION_LIMIT}</span>
                <span className="status-chip">Grace minutes granted: {Math.round(snapshot.usage.graceSecondsGranted / 60)} min</span>
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
              <button type="button" onClick={() => void handleSave()}>
                Save settings
              </button>
              <button type="button" className="ghost-button" onClick={() => void onStopSession()}>
                End current session
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