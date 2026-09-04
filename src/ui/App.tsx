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
import {
  CORRECT_BONUS, DRILL_POINTS, JOIN_BONUS, Party, claimJoinBonus, isLive, isOver,
  loadParty, loadPoints, msUntilNextChange, partyFromHash, savePoints, saveParty,
} from '../coach/party';
import { discoBeat } from '../audio/discoBeat';
import { sfx } from '../audio/sfx';
import {
  BADGES, BadgeDef, Mode, RankState, XP_BOSS_CLEAR, XP_LEVEL_PASS, earnedBadges, loadBestStreak,
  loadMode, loadSeenBadges, loadXp, newlyEarned, rankFor, saveBestStreak, saveSeenBadges, saveXp,
  setMode as persistMode, cfg,
} from '../coach/profile';
import { Onboarding } from './views/Onboarding';
import { BadgeToast, RankUpToast } from './components/Celebrate';
import { Ambient } from './components/Ambient';
import { SettingsModal } from './components/SettingsModal';
import { Settings, applySettings, loadSettings } from '../coach/settings';
import { setSfx } from '../audio/sfx';
import {
  BANNER_HEIGHT, DiscoBanner, DiscoBar, DiscoOverlay, useDiscoPulse,
} from './components/DiscoMode';
import { Home } from './views/Home';
import { LevelView } from './views/LevelView';
import { DojoView } from './views/DojoView';
import { HandPlayView } from './views/HandPlayView';
import { LabView } from './views/LabView';
import { TutorialView } from './views/TutorialView';
import { HelpWidget } from './components/HelpWidget';
import { LeaderboardView } from './views/LeaderboardView';
import { UpgradeModal } from './components/Upgrade';
import { ShareModal, SharedScoreView } from './components/Share';

type View =
  | { k: 'home' }
  | { k: 'level'; id: LevelId }
  | { k: 'hands' }
  | { k: 'casual' }
  | { k: 'tutorial' }
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
  const [mode, setModeState] = useState<Mode | null>(() => loadMode());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcome, setWelcome] = useState(false);

  // Cosmetics are stamped on <html> once at boot and again on change.
  useEffect(() => { applySettings(settings); setSfx(settings.sound); }, [settings]);
  const [xp, setXp] = useState(() => loadXp());
  const [bestStreak, setBestStreak] = useState(() => loadBestStreak());
  const [seenBadges, setSeenBadges] = useState<string[]>(() => loadSeenBadges());
  const [badgeToast, setBadgeToast] = useState<BadgeDef | null>(null);
  const [rankToast, setRankToast] = useState<RankState | null>(null);

  // The active mode is a module-level setting the level modules read for their
  // tolerances, so keep it in step with React state.
  useEffect(() => { if (mode) persistMode(mode); }, [mode]);
  useEffect(() => { saveXp(xp); }, [xp]);
  useEffect(() => { saveBestStreak(bestStreak); }, [bestStreak]);

  const onScored = useCallback((gain: number, streak: number) => {
    if (gain > 0) {
      setXp((n) => {
        const next = n + gain;
        // Crossing a threshold is a moment, so announce it.
        if (rankFor(next).index > rankFor(n).index) {
          setRankToast(rankFor(next));
          sfx.levelUp();
        }
        return next;
      });
    }
    setBestStreak((b) => Math.max(b, streak));
  }, []);
  const [sharing, setSharing] = useState<SharedScore | null>(null);
  const [incoming, setIncoming] = useState<DecodedScore | null>(
    () => (typeof location === 'undefined' ? null : scoreFromHash(location.hash)),
  );
  const [roster, setRoster] = useState<StoredEntry[]>(() => loadRoster());
  const [admin, setAdminOn] = useState(() => adminEnabled());
  const [override, setOverrideState] = useState<Override | null>(() => loadOverride());
  const [party, setPartyState] = useState<Party | null>(() => loadParty());
  const [points, setPointsState] = useState(() => loadPoints());
  const pulse = useDiscoPulse();
  // Re-render exactly when the party is due to start or finish, so a booked
  // party lights up on its own without anybody reloading the page.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const delay = msUntilNextChange(party);
    if (delay === null) return;
    const id = window.setTimeout(
      () => setTick((n) => n + 1),
      Math.max(500, Math.min(delay + 250, 60_000)),
    );
    return () => window.clearTimeout(id);
  }, [party, tick]);
  const partyOn = isLive(party);

  // Persist from effects, never from inside a state updater: React may invoke
  // an updater twice or discard it, and the early-return path below would skip
  // the write entirely, leaving storage out of step with what is on screen.
  useEffect(() => { saveParty(party); }, [party]);
  useEffect(() => { savePoints(points); }, [points]);

  const setParty = useCallback((p: Party | null) => {
    setPartyState(p);
    if (!p) discoBeat.stop();
  }, []);

  const addPoints = useCallback((delta: number) => {
    setPointsState((n) => n + delta);
  }, []);

  /** Adopt a party arriving in a link, and pay the join bonus once. */
  const takeParty = useCallback((hash: string) => {
    const found = partyFromHash(hash);
    // A booked party is worth keeping too: the invite can arrive days early.
    if (!found || isOver(found)) return;
    setPartyState((cur) => (cur && cur.at >= found.at ? cur : found));
    // Claim outside the updater. claimJoinBonus writes a ledger so the bonus is
    // paid once per party, and a StrictMode double-invoke would make the second
    // call a no-op and swallow the points.
    if (isLive(found)) {
      const { fresh } = claimJoinBonus(found, loadPoints());
      if (fresh) setPointsState((n) => n + JOIN_BONUS);
    }
  }, []);

  useEffect(() => {
    if (typeof location !== 'undefined') takeParty(location.hash);
  }, [takeParty]);

  // Music stops when the party is over, whatever else is going on.
  useEffect(() => { if (!partyOn) discoBeat.stop(); }, [partyOn]);

  useEffect(() => { saveRoster(roster); }, [roster]);

  const setOverride = useCallback((next: Override | null) => {
    setOverrideState(next);
    saveOverride(next);
  }, []);

  // The score everything else uses. In admin mode an override sits on top of it.
  const me = useMemo(
    () => applyOverride(
      buildScore(progress, name || 'You', pro, points, ''),
      admin ? override : null,
    ),
    [progress, name, pro, admin, override, points],
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
      takeParty(location.hash);
      if (takeBoard(location.hash)) return;
      const found = scoreFromHash(location.hash);
      if (found) setIncoming(found);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [takeBoard, takeParty]);

  const dismissIncoming = useCallback(() => {
    setIncoming(null);
    // Drop the payload so a refresh does not re-open the challenge.
    if (typeof history !== 'undefined') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, []);

  useEffect(() => { saveProgress(progress); }, [progress]);

  /** The reset the dialog promises: progress, XP, streak, badges, points. */
  const resetAll = useCallback(() => {
    setProgress(emptyProgress());
    setXp(0);
    setBestStreak(0);
    setPointsState(0);
    // seenBadges only persists inside the toast effect, which early-returns
    // when nothing is newly earned — so clear storage explicitly.
    setSeenBadges([]);
    saveSeenBadges([]);
  }, []);

  const onResult = useCallback((r: DrillResult) => {
    setProgress((p) => applyResult(p, r));
    // Drills answered during a party are worth birthday points.
    if (isLive(loadParty())) addPoints(DRILL_POINTS + (r.correct ? CORRECT_BONUS : 0));
  }, [addPoints]);
  const home = useCallback(() => {
    setView({ k: 'home' });
    setBossLabel(undefined);
    // The table greeting is one-shot however you leave the table.
    setWelcome(false);
  }, []);

  const pick = useCallback((id: LevelId) => {
    if (isHandPlay(id)) { setView({ k: 'hands' }); return; }
    setProgress((p) => startAttempt(p, id));
    setView({ k: 'level', id });
  }, []);

  const badges = useMemo(
    () => earnedBadges(progress, {
      xp, bestStreak, birthdayPoints: points,
      bossesCleared: progress.mistakes.filter((m) => m.retired).length,
    }),
    [progress, xp, bestStreak, points],
  );

  // A badge becoming true is worth a fuss, but only the first time.
  useEffect(() => {
    const fresh = newlyEarned(seenBadges, badges);
    if (fresh.length === 0) return;
    const def = BADGES.find((b) => b.id === fresh[0]);
    if (def) { setBadgeToast(def); sfx.badge(); }
    setSeenBadges(badges);
    saveSeenBadges(badges);
  }, [badges, seenBadges]);

  if (!mode) {
    return (
      <>
        <Ambient />
        <div className="relative z-10">
          <Onboarding
            onPick={(m) => {
              persistMode(m);
              setModeState(m);
              // The first thing that happens is a hand being dealt to you.
              setWelcome(true);
              setView({ k: 'casual' });
            }}
          />
        </div>
      </>
    );
  }

  if (incoming) {
    return (
      <>
      <Ambient />
      <div className="relative z-10">
      <SharedScoreView
        theirs={incoming.score}
        yours={me}
        intact={incoming.intact}
        hasProgress={progress.history.length > 0}
        onStart={() => {
          dismissIncoming();
          // A brand-new player who arrived via a friend's link was promised a
          // dealt hand at the door; deliver that before any curriculum.
          if (welcome) { setView({ k: 'casual' }); return; }
          const next = LEVEL_ORDER.find((id) => !levelProgress(progress, id).completed) ?? 'L0';
          pick(next);
        }}
        onDismiss={dismissIncoming}
      />
      </div>
      </>
    );
  }

  const body = (() => {
    switch (view.k) {
      case 'home':
        return (
          <Home
            progress={progress}
            pro={pro}
            mode={mode!}
            xp={xp}
            badges={badges}
            onPlay={() => setView({ k: 'casual' })}
            onTutorial={() => setView({ k: 'tutorial' })}
            onMode={() => setSettingsOpen(true)}
            onPick={pick}
            onDojo={() => setView({ k: 'dojo' })}
            onLab={() => setView({ k: 'lab' })}
            onUpgrade={() => setModal(true)}
            onShare={shareOverall}
            onBoard={() => setView({ k: 'board' })}
            boardCount={roster.length + 1}
            onReset={resetAll}
          />
        );

      case 'level': {
        const level = getLevel(view.id);
        if (!level) return null;
        return (
          <LevelView
            key={view.id} level={level} pro={pro} mode={mode!} showTimer={settings.timer}
            onScored={onScored}
            timeTrend={timeTrend(progress, view.id)}
            onResult={onResult}
            onFinish={(correct, total) => {
              // Passing a level for the FIRST time pays its XP bonus — the
              // constant existed since the XP system landed but was never
              // wired, so finishing a level felt no different from quitting.
              const firstPass =
                correct / total >= cfg().passMark
                && !levelProgress(progress, view.id).completed;
              setProgress((p) => finishAttempt(p, view.id, level.drillCount, cfg().passMark));
              if (firstPass) onScored(XP_LEVEL_PASS, 0);
            }}
            onShare={(c, t, ms) => shareRun(view.id, level.title, c, t, ms)}
            onExit={home}
          />
        );
      }

      case 'tutorial':
        return (
          <TutorialView
            mode={mode}
            onPlay={() => setView({ k: 'casual' })}
            onLearn={() => pick('L0')}
            onExit={home}
          />
        );

      case 'casual':
        return (
          <HandPlayView
            pro={pro}
            casual
            mode={mode}
            welcome={welcome}
            onTutorial={() => setView({ k: 'tutorial' })}
            onWelcomeDone={() => setWelcome(false)}
            onShare={() => undefined}
            onExit={home}
          />
        );

      case 'hands':
        return (
          <HandPlayView
            pro={pro}
            mode={mode}
            onShare={(won, total) => shareRun('L8', 'Full hands', won, total, 0)}
            onExit={home}
          />
        );

      case 'dojo':
        return (
          <DojoView
            progress={progress} pro={pro} kid={mode === 'kid'} onExit={home}
            onRun={(level, boss) => { setBossLabel(undefined); setView({ k: 'pack', level, boss }); }}
          />
        );

      case 'pack':
        return (
          <LevelView
            key={view.level.title} level={view.level} pro={pro} mode={mode!}
            showTimer={settings.timer} onScored={onScored} timeTrend={[]}
            bossLabel={bossLabel}
            onResult={onResult}
            onFinish={(correct, total) => {
              if (!view.boss) return;
              if (correct >= BOSS_PASS) {
                setProgress((p) => clearTag(p, view.boss!));
                setBossLabel(`Boss cleared — ${correct}/${total}. That leak is retired.`);
                onScored(XP_BOSS_CLEAR, 0);
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
            party={party}
            onRoster={updateRoster}
            onOverride={setOverride}
            onParty={setParty}
            onExit={home}
          />
        );

      case 'lab':
        return pro ? <LabView onExit={home} /> : null;
    }
  })();

  return (
    <>
      <Ambient />
      {partyOn && party && (
        <>
          <DiscoOverlay pulse={pulse} />
          <DiscoBanner party={party} pulse={pulse} />
        </>
      )}
      <div className="relative z-10" style={partyOn ? { paddingTop: BANNER_HEIGHT } : undefined}>
        {body}
      </div>
      {partyOn && party && (
        <DiscoBar
          party={party}
          points={points}
          onPoints={addPoints}
          canEnd={admin}
          onEnd={() => setParty(null)}
        />
      )}
      {sharing && (
        <ShareModal
          score={sharing}
          name={name}
          party={partyOn ? party : null}
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
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          mode={mode}
          name={name}
          onSettings={setSettings}
          onMode={(m) => { persistMode(m); setModeState(m); }}
          onName={setName}
          onReset={resetAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {badgeToast && (
        <BadgeToast badge={badgeToast} mode={mode} onDone={() => setBadgeToast(null)} />
      )}
      {rankToast && (
        <RankUpToast state={rankToast} mode={mode} onDone={() => setRankToast(null)} />
      )}
      {view.k !== 'tutorial' && (
        <HelpWidget mode={mode} onTutorial={() => setView({ k: 'tutorial' })} />
      )}
      {view.k !== 'home' && !partyOn && (
        <button
          onClick={() => setSettingsOpen(true)}
          className="fixed right-4 top-16 z-40 rounded-lg border border-white/15 bg-black/40 px-2.5 py-1
                     text-sm text-emerald-200/60 transition hover:text-emerald-100"
          title="Settings"
        >
          ⚙
        </button>
      )}
      {view.k !== 'home' && !partyOn && (
        <button
          onClick={() => setModal(true)}
          className={`fixed right-4 top-4 z-40 rounded-xl border px-4 py-2 text-xs font-black
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
