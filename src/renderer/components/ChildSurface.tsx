import { motion } from 'framer-motion';
import type { RendererSnapshot } from '../../main/types';

interface ChildSurfaceProps {
  snapshot: RendererSnapshot;
  busyMessage: string;
  actionError: string;
  onOpenAdmin: () => void;
  onStartSession: () => Promise<void>;
}

function formatMinutes(seconds: number): string {
  return `${Math.max(0, Math.ceil(seconds / 60))} min`;
}

function formatClock(iso: string | null): string {
  if (!iso) {
    return 'Now';
  }
  return new Intl.DateTimeFormat([], {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

function describeAccess(snapshot: RendererSnapshot): string {
  const { availability, state } = snapshot;
  if (state.activeSession) {
    return 'Session is active. The app has moved into the background so games can be opened normally.';
  }
  if (availability.reason === 'cooldown') {
    return `Next session unlocks at ${formatClock(availability.nextAllowedAt)}.`;
  }
  if (availability.reason === 'quota') {
    return 'This week\'s time is fully used. New time unlocks next Monday.';
  }
  return 'Press start session, then open any game you want while the timer is running.';
}

export function ChildSurface({
  snapshot,
  busyMessage,
  actionError,
  onOpenAdmin,
  onStartSession
}: ChildSurfaceProps) {
  const activeSession = snapshot.state.activeSession;
  const canStart = snapshot.availability.reason === 'ok' && snapshot.availability.canStart;

  return (
    <main className="child-surface">
      <motion.section
        className="hero-panel"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <div className="brand-strip">
          <span className="brand-kicker">Child profile: {snapshot.config.childProfile.displayName || 'Child'}</span>
          <button type="button" className="admin-entry-button" onClick={onOpenAdmin}>
            Admin access
          </button>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Game Time Control</p>
          <h1>
            Start a session.
            <br />
            Play normally.
          </h1>
          <p className="hero-note">{describeAccess(snapshot)}</p>
        </div>

        <div className="hero-stats">
          <div>
            <span>Weekly time left</span>
            <strong>{formatMinutes(snapshot.availability.weeklyRemainingSeconds)}</strong>
          </div>
          <div>
            <span>Session max</span>
            <strong>{formatMinutes(snapshot.config.sessionMaxSeconds)}</strong>
          </div>
          <div>
            <span>Cooldown</span>
            <strong>{snapshot.availability.reason === 'cooldown' && snapshot.availability.nextAllowedAt ? formatClock(snapshot.availability.nextAllowedAt) : 'Ready'}</strong>
          </div>
        </div>
      </motion.section>

      <motion.section
        className="launcher-panel"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.08, ease: 'easeOut' }}
      >
        <header className="section-header">
          <div>
            <p className="eyebrow">Session control</p>
            <h2>One button</h2>
          </div>
          {busyMessage ? <span className="status-chip">{busyMessage}</span> : null}
        </header>

        <div className="session-action-block">
          <p className="empty-copy">
            When a session starts, this app drops to the background and stops blocking app switching. When time runs out, it comes back to the front and locks the screen again.
          </p>
          <button type="button" disabled={!canStart} className="primary-session-button" onClick={() => void onStartSession()}>
            Start session
          </button>
        </div>

        {activeSession ? (
          <div className="session-ribbon">
            <span>Current session</span>
            <strong>Free play window</strong>
            <em>{formatMinutes(activeSession.remainingSeconds)} remaining</em>
          </div>
        ) : null}

        {actionError ? <p className="inline-error">{actionError}</p> : null}
      </motion.section>
    </main>
  );
}