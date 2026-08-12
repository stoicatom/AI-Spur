import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Config } from '../shared/config';
import { getConfig, onConfigUpdated, saveConfig } from '../shared/ipc';
import { Sidebar } from './components/Sidebar';
import { PanelBody } from './components/PanelBody';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { DEFAULT_PANEL, findPanel, type PanelId } from './panels';
import './settings.css';
import '../onboarding/onboarding.css';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; config: Config }
  | { status: 'error'; message: string };

/**
 * Delay before a config edit reaches disk. Typing in a phrase field fires a
 * patch per keystroke; without this every character would be a file write.
 */
const SAVE_DEBOUNCE_MS = 400;

export function App() {
  const [active, setActive] = useState<PanelId>(DEFAULT_PANEL);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [saveError, setSaveError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  // Holds the newest config awaiting a write, so a burst of edits collapses
  // into one save carrying the final value.
  const pendingRef = useRef<Config | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadConfig = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const config = await getConfig();
      setLoad({ status: 'ready', config });
    } catch (error) {
      // Surfaced in the UI rather than only logged — CLAUDE.md §4.2 forbids
      // swallowing IPC failures into the console.
      setLoad({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const flush = useCallback(async () => {
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    try {
      await saveConfig(next);
      setSaveError(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  /** Apply an edit locally at once, then persist it after the debounce. */
  const patch = useCallback(
    (delta: Partial<Config>) => {
      setLoad((prev) => {
        if (prev.status !== 'ready') return prev;
        const merged = { ...prev.config, ...delta };
        pendingRef.current = merged;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
        return { status: 'ready', config: merged };
      });
    },
    [flush]
  );

  // Never lose the last edit to an unmount mid-debounce.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void flush();
    },
    [flush]
  );

  // Keep the view in sync when Rust mutates config behind our back
  // (usage counters, skin activation from the tray, etc.).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    onConfigUpdated((partial) => {
      setLoad((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', config: { ...prev.config, ...partial } }
          : prev
      );
    })
      .then((fn) => {
        // The listener may resolve after unmount; drop it immediately if so.
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {
        // A failed subscription only costs live updates; the panel still works
        // from the config we already loaded, so this is not surfaced.
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  /**
   * Persist onboarding results immediately rather than through the debounce —
   * the user is leaving the wizard, so the choices must be durable before the
   * view switches. Errors propagate so the wizard can surface them.
   */
  const finishOnboarding = useCallback(
    async (patch: Partial<Config>) => {
      if (load.status !== 'ready') return;
      const merged = { ...load.config, ...patch };
      await saveConfig(merged);
      setLoad({ status: 'ready', config: merged });
    },
    [load]
  );

  const panel = findPanel(active);

  // First launch takes over the whole window: no sidebar to wander off into
  // before the essentials are set.
  if (load.status === 'ready' && load.config.firstLaunch) {
    return (
      <div className="settings-root settings-root--onboarding">
        <main className="content">
          <OnboardingFlow
            config={load.config}
            onComplete={finishOnboarding}
            onSkip={() => finishOnboarding({ firstLaunch: false })}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="settings-root">
      <Sidebar active={active} onSelect={setActive} />

      <main className="content">
        {load.status === 'loading' && (
          <div className="state-block">
            <p className="state-block__text">正在读取配置…</p>
          </div>
        )}

        {load.status === 'error' && (
          <div className="state-block state-block--error" role="alert">
            <p className="state-block__title font-display">配置读取失败</p>
            <p className="state-block__text font-mono">{load.message}</p>
            <button type="button" className="btn btn--primary" onClick={() => void loadConfig()}>
              重试
            </button>
          </div>
        )}

        {load.status === 'ready' && (
          <>
            {saveError && (
              <div className="callout callout--error" role="alert">
                <p className="callout__title">配置保存失败</p>
                <p className="callout__text font-mono">{saveError}</p>
              </div>
            )}

            <AnimatePresence mode="wait">
              <motion.section
                key={active}
                id={`panel-${active}`}
                role="tabpanel"
                aria-labelledby={`nav-${active}`}
                tabIndex={-1}
                className="panel"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 10 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -10 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.4, 0, 0.2, 1] }}
              >
                <header className="panel__header">
                  <h1 className="panel__title font-display">{panel.label}</h1>
                </header>

                <div className="panel__body">
                  <PanelBody panel={active} config={load.config} onPatch={patch} />
                </div>
              </motion.section>
            </AnimatePresence>
          </>
        )}
      </main>
    </div>
  );
}
