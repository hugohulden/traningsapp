import { createContext, useContext, useEffect, useState } from 'react';
import { initApp, useSettings } from './db/store';
import { TodayScreen } from './screens/Today';
import { PlanScreen, WeekScreen } from './screens/Plan';
import { GymSessionScreen } from './screens/GymSession';
import { StatsScreen } from './screens/Stats';
import { BodyScreen } from './screens/Body';
import { SettingsScreen } from './screens/Settings';
import type { AppSettings } from './plan/settings';
import { syncIntervals } from './sync/sync';
import { ConfirmHost } from './ui/confirm';
import { useTheme } from './ui/theme';

export type Tab = 'idag' | 'plan' | 'stat' | 'kropp' | 'mer';
export type Screen = { name: 'gym'; id: string } | { name: 'week'; index: number };

interface Nav {
  push: (s: Screen) => void;
  pop: () => void;
  setTab: (t: Tab) => void;
}

const NavCtx = createContext<Nav>(null as unknown as Nav);
export const useNav = () => useContext(NavCtx);

const SettingsCtx = createContext<AppSettings>(null as unknown as AppSettings);
export const useAppSettings = () => useContext(SettingsCtx);

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'idag', label: 'Idag', icon: '◉' },
  { id: 'plan', label: 'Plan', icon: '▦' },
  { id: 'stat', label: 'Statistik', icon: '▲' },
  { id: 'kropp', label: 'Kropp', icon: '⚖' },
  { id: 'mer', label: 'Mer', icon: '⋯' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('idag');
  const [stack, setStack] = useState<Screen[]>([]);
  const settings = useSettings();
  const theme = useTheme(settings?.theme);

  useEffect(() => {
    initApp().then(() => {
      setReady(true);
      void syncIntervals();
    });
    const vis = () => document.visibilityState === 'visible' && void syncIntervals();
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', vis);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, stack.length]);

  if (!ready || !settings) return <div className="p-8 text-mute">Laddar…</div>;

  const nav: Nav = {
    push: (s) => setStack((x) => [...x, s]),
    pop: () => setStack((x) => x.slice(0, -1)),
    setTab: (t) => {
      setStack([]);
      setTab(t);
    },
  };
  const top = stack[stack.length - 1];

  return (
    <SettingsCtx.Provider value={settings}>
      <NavCtx.Provider value={nav}>
        {top ? (
          top.name === 'gym' ? (
            <GymSessionScreen id={top.id} />
          ) : (
            <WeekScreen index={top.index} />
          )
        ) : (
          <div className="pb-24" key={theme}>
            {tab === 'idag' && <TodayScreen />}
            {tab === 'plan' && <PlanScreen />}
            {tab === 'stat' && <StatsScreen />}
            {tab === 'kropp' && <BodyScreen />}
            {tab === 'mer' && <SettingsScreen />}
            <nav className="fixed bottom-0 inset-x-0 z-30 bg-bg/95 backdrop-blur border-t border-line safe-bottom">
              <div className="flex">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => nav.setTab(t.id)}
                    className={`flex-1 pt-2 pb-1 flex flex-col items-center gap-0.5 ${tab === t.id ? 'text-accent' : 'text-mute'}`}
                  >
                    <span className="text-xl leading-none">{t.icon}</span>
                    <span className="text-[11px]">{t.label}</span>
                  </button>
                ))}
              </div>
            </nav>
          </div>
        )}
        <ConfirmHost />
      </NavCtx.Provider>
    </SettingsCtx.Provider>
  );
}
