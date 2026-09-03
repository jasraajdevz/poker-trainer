import { useCallback, useEffect, useState } from 'react';
import { getLevel, isHandPlay } from '../curriculum/registry';
import { LevelId, LevelModule } from '../curriculum/types';
import {
  DrillResult, Progress, applyResult, emptyProgress, finishAttempt, loadProgress,
  saveProgress, startAttempt, timeTrend,
} from '../coach/progress';
import { BOSS_PASS, clearTag } from '../coach/dojo';
import { ErrorTag } from '../coach/mistakes';
import { deactivate, readTier } from '../coach/pro';
import { Home } from './views/Home';
import { LevelView } from './views/LevelView';
import { DojoView } from './views/DojoView';
import { HandPlayView } from './views/HandPlayView';
import { LabView } from './views/LabView';
import { UpgradeModal } from './components/Upgrade';

type View =
  | { k: 'home' }
  | { k: 'level'; id: LevelId }
  | { k: 'hands' }
  | { k: 'dojo' }
  | { k: 'pack'; level: LevelModule; boss?: ErrorTag }
  | { k: 'lab' };

export function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [pro, setPro] = useState(() => readTier());
  const [view, setView] = useState<View>({ k: 'home' });
  const [modal, setModal] = useState(false);
  const [bossLabel, setBossLabel] = useState<string | undefined>();

  useEffect(() => { saveProgress(progress); }, [progress]);

  const onResult = useCallback((r: DrillResult) => setProgress((p) => applyResult(p, r)), []);
  const home = useCallback(() => { setView({ k: 'home' }); setBossLabel(undefined); }, []);

  const pick = useCallback((id: LevelId) => {
    if (isHandPlay(id)) { setView({ k: 'hands' }); return; }
    setProgress((p) => startAttempt(p, id));
    setView({ k: 'level', id });
  }, []);

  const body = (() => {
    switch (view.k) {
      case 'home':
        return (
          <Home
            progress={progress} pro={pro} onPick={pick}
            onDojo={() => setView({ k: 'dojo' })}
            onLab={() => setView({ k: 'lab' })}
            onUpgrade={() => setModal(true)}
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
            onExit={home}
          />
        );
      }

      case 'hands':
        return <HandPlayView pro={pro} onExit={home} />;

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
            onExit={() => setView({ k: 'dojo' })}
          />
        );

      case 'lab':
        return pro ? <LabView onExit={home} /> : null;
    }
  })();

  return (
    <>
      {body}
      {modal && (
        <UpgradeModal
          pro={pro}
          onClose={() => setModal(false)}
          onActivate={() => { setPro(true); }}
          onDeactivate={() => { deactivate(); setPro(false); setModal(false); home(); }}
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
          {pro ? '★ Omega' : 'Upgraded mode'}
        </button>
      )}
    </>
  );
}
