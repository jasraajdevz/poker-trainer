import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLevel, isHandPlay } from '../curriculum/registry';
import { LevelId, LevelModule } from '../curriculum/types';
import {
  DrillResult, LEVEL_ORDER, Progress, applyResult, emptyProgress, finishAttempt,
  levelProgress, loadProgress, saveProgress, startAttempt, timeTrend,
} from '../coach/progress';
import { BOSS_PASS, clearTag } from '../coach/dojo';
import { ErrorTag } from '../coach/mistakes';
import { deactivate, readTier } from '../coach/pro';
import {
  DecodedScore, SharedScore, buildRunScore, buildScore, loadName, scoreFromHash,
} from '../coach/share';
import {
  StoredEntry, boardFromHash, loadRoster, mergeEntry, mergeMany, saveRoster,
} from '../coach/leaderboard';
import {
  Override, adminEnabled, applyOverride, loadOverride, saveOverride, setAdmin,
} from '../coach/admin';
import { Home } from './views/Home';
import { LevelView } from './views/LevelView';
import { DojoView } from './views/DojoView';
import { HandPlayView } from './views/HandPlayView';
import { LabView } from './views/LabView';
import { LeaderboardView } from './views/LeaderboardView';
import { UpgradeModal } from './components/Upgrade';
import { ShareModal, SharedScoreView } from './components/Share';

type View =
  | { k: 'home' }
  | { k: 'level'; id: LevelId }
  | { k: 'hands' }
  | { k: 'dojo' }
  | { k: 'pack'; level: LevelModule; boss?: ErrorTag }
  | { k: 'lab' }
  | { k: 'board' };

export function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [pro, setPro] = useState(() => readTier());
  const [view, setView] = useState<View>({ k: 'home' });
  const [modal, setModal] = useState(false);
  const [bossLabel, setBossLabel] = useState<string | undefined>();
  const [name, setName] = useState(() => loadName());
  const [sharing, setSharing] = useState<SharedScore | null>(null);
  const [incoming, setIncoming] = useState<DecodedScore | null>(
    () => (typeof location === 'undefined' ? null : scoreFromHash(location.hash)),
  );
  const [roster, setRoster] = useState<StoredEntry[]>(() => loadRoster());
  const [admin, setAdminOn] = useState(() => adminEnabled());
  const [override, setOverrideState] = useState<Override | null>(() => loadOverride());

  useEffect(() => { saveRoster(roster); }, [roster]);

  const setOverride = useCallback((next: Override | null) => {
    setOverrideState(next);
    saveOverride(next);
  }, []);

  // The score everything else uses. In admin mode an override sits on top of it.
  const me = useMemo(
    () => applyOverride(buildScore(progress, name || 'You', pro), admin ? override : null),
    [progress, name, pro, admin, override],
  );

  const updateRoster = useCallback((next: StoredEntry[]) => setRoster(next), []);

  /** A board link merges everyone it carries and drops you on the table. */
  const takeBoard = useCallback((hash: string): boolean => {
    const found = boardFromHash(hash);
    if (!found) return false;
    setRoster((r) => mergeMany(r, found.scores, found.intact, Date.now()));
    setView({ k: 'board' });
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', location.pathname + location.search);
    }
    return true;
  }, []);

  // A shared score also earns a place on your board, so it fills up by itself.
  useEffect(() => {
    if (!incoming) return;
    setRoster((r) => mergeEntry(r, incoming.score, incoming.intact, Date.now()));
  }, [incoming]);

  useEffect(() => {
    if (typeof location !== 'undefined') takeBoard(location.hash);
  }, [takeBoard]);

  const shareOverall = useCallback(
    () => setSharing(buildScore(progress, name, pro)),
    [progress, name, pro],
  );
  const shareRun = useCallback(
    (id: LevelId, title: string, correct: number, total: number, ms: number) =>
      setSharing(buildRunScore(buildScore(progress, name, pro), id, title, correct, total, ms)),
    [progress, name, pro],
  );

  // A friend's link pasted while the app is already open changes only the
  // fragment, which does not remount anything. Listen for it.
  useEffect(() => {
    const onHash = () => {
      if (takeBoard(location.hash)) return;
      const found = scoreFromHash(location.hash);
      if (found) setIncoming(found);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [takeBoard]);

  const dismissIncoming = useCallback(() => {
    setIncoming(null);
    // Drop the payload so a refresh does not re-open the challenge.
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, []);

  useEffect(() => { saveProgress(progress); }, [progress]);

  const onResult = useCallback((r: DrillResult) => setProgress((p) => applyResult(p, r)), []);
  const home = useCallback(() => { setView({ k: 'home' }); setBossLabel(undefined); }, []);

  const pick = useCallback((id: LevelId) => {
    if (isHandPlay(id)) { setView({ k: 'hands' }); return; }
    setProgress((p) => startAttempt(p, id));
    setView({ k: 'level', id });
  }, []);

  if (incoming) {
    return (
      <SharedScoreView
        theirs={incoming.score}
        yours={me}
        intact={incoming.intact}
        hasProgress={progress.history.length > 0}
        onStart={() => {
          dismissIncoming();
          const next = LEVEL_ORDER.find((id) => !levelProgress(progress, id).completed) ?? 'L0';
          pick(next);
        }}
        onDismiss={dismissIncoming}
      />
    );
  }

  const body = (() => {
    switch (view.k) {
      case 'home':
        return (
          <Home
            progress={progress} pro={pro} onPick={pick}
            onDojo={() => setView({ k: 'dojo' })}
            onLab={() => setView({ k: 'lab' })}
            onUpgrade={() => setModal(true)}
            onShare={shareOverall}
            onBoard={() => setView({ k: 'board' })}
            boardCount={roster.length + 1}
            onReset={() => setProgress(emptyProgress())}
          />
        );

      case 'level': {
        const level = getLevel(view.id);
        if (!level) return null;
        return (
          <LevelView
            key={view.id} level={level} pro={pro}
            timeTrend={timeTrend(progress, view.id)}
            onResult={onResult}
            onFinish={() => setProgress((p) => finishAttempt(p, view.id, level.drillCount))}
            onShare={(c, t, ms) => shareRun(view.id, level.title, c, t, ms)}
            onExit={home}
          />
        );
      }

      case 'hands':
        return (
          <HandPlayView
            pro={pro}
            onShare={(won, total) => shareRun('L8', 'Full hands', won, total, 0)}
            onExit={home}
          />
        );

      case 'dojo':
        return (
          <DojoView
            progress={progress} pro={pro} onExit={home}
            onRun={(level, boss) => { setBossLabel(undefined); setView({ k: 'pack', level, boss }); }}
          />
        );

      case 'pack':
        return (
          <LevelView
            key={view.level.title} level={view.level} pro={pro} timeTrend={[]}
            bossLabel={bossLabel}
            onResult={onResult}
            onFinish={(correct, total) => {
              if (!view.boss) return;
              if (correct >= BOSS_PASS) {
                setProgress((p) => clearTag(p, view.boss!));
                setBossLabel(`Boss cleared — ${correct}/${total}. That leak is retired.`);
              } else {
                setBossLabel(`${correct}/${total}. You need ${BOSS_PASS} to clear it. The leak stays.`);
              }
            }}
            onShare={(c, t, ms) => shareRun('L0', view.level.title, c, t, ms)}
            onExit={() => setView({ k: 'dojo' })}
          />
        );

      case 'board':
        return (
          <LeaderboardView
            roster={roster}
            me={me}
            admin={admin}
            override={override}
            onRoster={updateRoster}
            onOverride={setOverride}
            onExit={home}
          />
        );

      case 'lab':
        return pro ? <LabView onExit={home} /> : null;
    }
  })();

  return (
    <>
      {body}
      {sharing && (
        <ShareModal
          score={sharing}
          name={name}
          onName={setName}
          onClose={() => setSharing(null)}
        />
      )}
      {modal && (
        <UpgradeModal
          pro={pro}
          onClose={() => setModal(false)}
          onActivate={() => { setPro(true); }}
          onAdmin={setAdminOn}
          onDeactivate={() => {
            // Losing the code closes the back door with it.
            deactivate();
            setAdmin(false);
            setAdminOn(false);
            setPro(false);
            setModal(false);
            home();
          }}
        />
      )}
      {view.k !== 'home' && (
        <button
          onClick={() => setModal(true)}
          className={`fixed right-4 top-4 z-40 rounded-lg border px-2.5 py-1 text-[10px] font-bold
            uppercase tracking-widest transition ${
            pro
              ? 'border-amber-300/60 bg-amber-400/15 text-amber-200'
              : 'border-amber-400/30 bg-black/40 text-amber-200/60 hover:text-amber-100'
          }`}
        >
          {pro ? (admin ? '★ Omega · admin' : '★ Omega') : 'Upgraded mode'}
        </button>
      )}
    </>
  );
}
