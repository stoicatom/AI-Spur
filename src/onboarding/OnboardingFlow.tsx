import { useCallback, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Config } from '../shared/config';
import { StepHotkey, StepPhrases, StepSkin, SUGGESTED_PHRASES } from './steps';

const STEP_LABELS = ['快捷键', '提示词', '完成'] as const;
const TOTAL_STEPS = STEP_LABELS.length;

export interface OnboardingFlowProps {
  config: Config;
  /** Persist the collected settings and mark onboarding done. */
  onComplete: (patch: Partial<Config>) => Promise<void>;
  /** Skip without changing anything except clearing firstLaunch. */
  onSkip: () => Promise<void>;
}

/**
 * Three-step first-launch wizard.
 *
 * Choices accumulate locally and are written once at the end, so abandoning
 * midway leaves the stored config untouched.
 */
export function OnboardingFlow({ config, onComplete, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [hotkey, setHotkey] = useState(config.hotkey);
  const [phrases, setPhrases] = useState<string[]>([...SUGGESTED_PHRASES]);
  const [activeSkin, setActiveSkin] = useState(config.activeSkin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const togglePhrase = useCallback((phrase: string) => {
    setPhrases((prev) =>
      prev.includes(phrase)
        ? // The schema requires ≥1 phrase; the checkbox is disabled at one.
          prev.length > 1
          ? prev.filter((p) => p !== phrase)
          : prev
        : [...prev, phrase]
    );
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <div className="onboard">
      <div
        className="onboard-progress"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-valuenow={step + 1}
        aria-label={`引导进度：第 ${step + 1} 步，共 ${TOTAL_STEPS} 步`}
      >
        {STEP_LABELS.map((label, index) => (
          <span
            key={label}
            className={`step${index < step ? ' step--completed' : ''}${
              index === step ? ' step--active' : ''
            }`}
          />
        ))}
      </div>

      <p className="onboard__counter font-mono">
        {step + 1} / {TOTAL_STEPS} · {STEP_LABELS[step]}
      </p>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 16 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
          transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 0 && <StepHotkey hotkey={hotkey} onHotkeyChange={setHotkey} />}
          {step === 1 && <StepPhrases selected={phrases} onToggle={togglePhrase} />}
          {step === 2 && (
            <StepSkin
              activeSkin={activeSkin}
              onSkinChange={setActiveSkin}
              hotkey={hotkey}
              threshold={config.autoSwitchThreshold}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <div className="callout callout--error" role="alert">
          <p className="callout__title">保存失败</p>
          <p className="callout__text font-mono">{error}</p>
        </div>
      )}

      <footer className="onboard__actions">
        {step === 0 ? (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void run(onSkip)}
          >
            跳过
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setStep((s) => s - 1)}
          >
            上一步
          </button>
        )}

        {isLastStep ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() =>
              void run(() =>
                onComplete({ hotkey, phrases, activeSkin, firstLaunch: false })
              )
            }
          >
            {busy ? '保存中…' : '开始使用'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => setStep((s) => s + 1)}
          >
            下一步
          </button>
        )}
      </footer>
    </div>
  );
}
