import { motion } from 'framer-motion';
import type { RendererSnapshot } from '../../main/types';

interface ChildSurfaceProps {
  snapshot: RendererSnapshot;
  busyMessage: string;
  actionError: string;
  onOpenAdmin: () => void;
  onLaunch: (gameId: string) => Promise<void>;
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
  if (state.activeSession?.status === 'awaiting-resume') {
    return 'A previous session is still running against the clock. Resume the same game to use the remaining time.';
  }
  if (availability.reason === 'cooldown') {
    return `Next session unlocks at ${formatClock(availability.nextAllowedAt)}.`;
  }
  if (availability.reason === 'quota') {
    return 'This week\'s time is fully used. New time unlocks next Monday.';
  }
  if (state.activeSession?.status === 'running') {
    return 'A game session is active. The timer will end it automatically.';
  }
  return 'Select one approved game to start a session.';
}

export function ChildSurface({
  snapshot,
  busyMessage,
  actionError,
  onOpenAdmin,
  onLaunch
}: ChildSurfaceProps) {
  const activeSession = snapshot.state.activeSession;
  const isAwaitingResume = activeSession?.status === 'awaiting-resume';

  return (
    <main className="child-surface">
      <motion.section
        className="hero-panel"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <div className="brand-strip">
          <button type="button" className="ghost-button" onClick={onOpenAdmin}>
            Family control
          </button>
          <span className="brand-kicker">Windows kiosk</span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">Game Time Control</p>
          <h1>
            One calm screen.
            <br />
            Clear limits.
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
            <strong>{snapshot.state.cooldownUntil ? formatClock(snapshot.state.cooldownUntil) : 'Ready'}</strong>
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
            <p className="eyebrow">Approved games</p>
            <h2>Launch library</h2>
          </div>
          {busyMessage ? <span className="status-chip">{busyMessage}</span> : null}
        </header>

        <div className="game-list">
          {snapshot.config.managedGames.length === 0 ? (
            <p className="empty-copy">No games configured yet. Ask an adult to set up the library.</p>
          ) : null}
          {snapshot.config.managedGames.map((game) => {
            const canLaunch =
              game.enabled &&
              ((snapshot.availability.reason === 'ok' && snapshot.availability.canStart) ||
                (isAwaitingResume && activeSession?.appId === game.id));
            return (
              <article className="game-row" key={game.id}>
                <div>
                  <p>{game.name}</p>
                  <span>{game.exePath}</span>
                </div>
                <button
                  type="button"
                  disabled={!canLaunch}
                  onClick={() => void onLaunch(game.id)}
                >
                  {isAwaitingResume && activeSession?.appId === game.id ? 'Resume session' : 'Start game'}
                </button>
              </article>
            );
          })}
        </div>

        {activeSession ? (
          <div className="session-ribbon">
            <span>Current session</span>
            <strong>{activeSession.appName}</strong>
            <em>{formatMinutes(activeSession.remainingSeconds)} remaining</em>
          </div>
        ) : null}

        {actionError ? <p className="inline-error">{actionError}</p> : null}
      </motion.section>
    </main>
  );
}
