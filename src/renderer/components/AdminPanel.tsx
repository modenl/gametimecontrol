import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  CountdownEvidenceSession,
  PasswordUpdateInput,
  PolicyUpdateInput,
  RendererSnapshot
} from '../../main/types';

function formatMinutesValue(minutes: number): string {
  const rounded = Math.round(minutes * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}` : `${rounded.toFixed(1)}`;
}

function formatEvidenceTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(value));
}

interface AdminPanelProps {
  snapshot: RendererSnapshot;
  open: boolean;
  busyMessage: string;
  actionError: string;
  evidenceSessions: CountdownEvidenceSession[];
  evidenceLoading: boolean;
  onClose: () => void;
  onRefreshEvidence: () => Promise<void>;
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
  evidenceSessions,
  evidenceLoading,
  onClose,
  onRefreshEvidence,
  onSavePolicy,
  onSavePassword,
  onStopSession,
  onUnlockDesktop
}: AdminPanelProps) {
  const [quotaMinutes, setQuotaMinutes] = useState(120);
  const [sessionMinutes, setSessionMinutes] = useState(40);
  const [graceMinutes, setGraceMinutes] = useState(5);
  const [gapHours, setGapHours] = useState(4);
  const [childDisplayName, setChildDisplayName] = useState('Child');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    setQuotaMinutes(snapshot.config.weeklyQuotaSeconds / 60);
    setSessionMinutes(snapshot.config.sessionMaxSeconds / 60);
    setGraceMinutes(snapshot.config.graceSeconds / 60);
    setGapHours(snapshot.config.minGapSeconds / 3600);
    setChildDisplayName(snapshot.config.childProfile.displayName);
  }, [snapshot]);

  async function handleSave() {
    setSaveStatus('Saving...');
    await onSavePolicy({
      weeklyQuotaMinutes: quotaMinutes,
      sessionMaxMinutes: sessionMinutes,
      graceMinutes,
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
                <input type="number" min={1} step={0.1} value={quotaMinutes} onChange={(event) => setQuotaMinutes(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Session max (minutes)</span>
                <input type="number" min={0.1} step={0.1} value={sessionMinutes} onChange={(event) => setSessionMinutes(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Grace length (minutes)</span>
                <input type="number" min={0} step={0.1} value={graceMinutes} onChange={(event) => setGraceMinutes(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Gap between sessions (hours)</span>
                <input type="number" min={0} step={0.1} value={gapHours} onChange={(event) => setGapHours(Number(event.target.value))} />
              </div>
              <div>
                <span className="field-label">Child profile name</span>
                <input value={childDisplayName} onChange={(event) => setChildDisplayName(event.target.value)} placeholder="Child" />
              </div>
            </section>

            <section className="admin-section">
              <div className="section-header compact">
                <div>
                  <p className="eyebrow">Automatic grace</p>
                  <h3>Warning window</h3>
                </div>
              </div>
              <p className="empty-copy">
                When the main session time ends, the app automatically gives a {formatMinutesValue(graceMinutes)}-minute flashing grace countdown. During that period it also plays repeating alert sounds so the child is much less likely to miss the final stop.
              </p>
              <div className="admin-inline-status">
                <span className="status-chip">Grace length: {formatMinutesValue(graceMinutes)} min</span>
                <span className="status-chip">Session test values accept decimals like 0.1 min</span>
              </div>
            </section>

            <section className="admin-section">
              <div className="section-header compact">
                <div>
                  <p className="eyebrow">Evidence</p>
                  <h3>Countdown screenshots</h3>
                </div>
                <button type="button" className="ghost-button" onClick={() => void onRefreshEvidence()}>
                  {evidenceLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              <p className="empty-copy">
                When grace countdown starts, the app captures 3 full-screen screenshots at 3-second intervals and keeps them here as proof the timer was visible.
              </p>
              {evidenceSessions.length === 0 ? (
                <div className="evidence-empty">
                  <span className="status-chip">No countdown evidence yet</span>
                  <p className="empty-copy">Start a short test session and let it reach grace to populate this gallery.</p>
                </div>
              ) : (
                <div className="evidence-session-list">
                  {evidenceSessions.map((session) => (
                    <section key={session.sessionId} className="evidence-session-card">
                      <div className="evidence-session-header">
                        <div>
                          <p className="eyebrow">Session</p>
                          <h4>{formatEvidenceTime(session.capturedAt)}</h4>
                        </div>
                        <span className="status-chip">{session.imageCount} shots</span>
                      </div>
                      <div className="evidence-grid">
                        {session.images.map((image) => (
                          <a
                            key={image.id}
                            className="evidence-shot"
                            href={image.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={image.filePath}
                          >
                            <img src={image.fileUrl} alt={`Countdown evidence shot ${image.shotNumber}`} loading="lazy" />
                            <div className="evidence-shot-meta">
                              <strong>Shot {image.shotNumber}</strong>
                              <span>{formatEvidenceTime(image.capturedAt)}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
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
