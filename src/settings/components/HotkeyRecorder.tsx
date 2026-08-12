import { useCallback, useEffect, useRef, useState } from 'react';
import { accelFromEvent, formatAccel } from '../hotkey';
import { checkHotkeyConflict, type ConflictInfo } from '../../shared/ipc';

export interface HotkeyRecorderProps {
  /** Currently stored accelerator, e.g. `CommandOrControl+Shift+W`. */
  value: string;
  /** Called with a new accelerator once it passes conflict checking. */
  onChange: (accel: string) => void;
}

type RecordState =
  | { phase: 'idle' }
  | { phase: 'recording' }
  | { phase: 'checking'; candidate: string }
  | { phase: 'conflict'; conflict: ConflictInfo }
  | { phase: 'error'; message: string };

/**
 * Click-to-record hotkey field.
 *
 * While recording, every keystroke is captured rather than reaching the page,
 * so a combination like Cmd+W cannot close the window mid-capture.
 */
export function HotkeyRecorder({ value, onChange }: HotkeyRecorderProps) {
  const [state, setState] = useState<RecordState>({ phase: 'idle' });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const commit = useCallback(
    async (candidate: string) => {
      setState({ phase: 'checking', candidate });
      try {
        const conflict = await checkHotkeyConflict(candidate);
        if (conflict) {
          setState({ phase: 'conflict', conflict });
          return;
        }
        onChange(candidate);
        setState({ phase: 'idle' });
      } catch (error) {
        setState({
          phase: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [onChange]
  );

  // Capture keys at the window level while recording so no combination leaks
  // through to the app or the OS-level webview shortcuts.
  useEffect(() => {
    if (state.phase !== 'recording') return;

    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === 'Escape') {
        setState({ phase: 'idle' });
        return;
      }
      const accel = accelFromEvent(event);
      if (accel) void commit(accel);
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [state.phase, commit]);

  const isRecording = state.phase === 'recording';
  const isChecking = state.phase === 'checking';

  return (
    <div className="hotkey-field">
      <button
        ref={buttonRef}
        type="button"
        className={`hotkey-recorder${isRecording ? ' hotkey-recorder--recording' : ''}`}
        aria-label="录制全局快捷键"
        aria-describedby="hotkey-hint"
        onClick={() => setState({ phase: 'recording' })}
        disabled={isChecking}
      >
        {isRecording ? (
          <>
            <span className="recording-indicator" aria-hidden="true" />
            <span>按下你的快捷键组合…</span>
          </>
        ) : isChecking ? (
          <span className="font-mono">检测冲突中…</span>
        ) : (
          <span className="font-mono hotkey-recorder__value">{formatAccel(value)}</span>
        )}
      </button>

      <p id="hotkey-hint" className="field-hint">
        {isRecording ? '按 Esc 取消录制' : '点击后按下组合键即可重新录制'}
      </p>

      {state.phase === 'conflict' && (
        <div className="callout callout--warning" role="alert">
          <p className="callout__title">
            <span className="font-mono">{formatAccel(state.conflict.hotkey)}</span> 已被其他应用占用
          </p>
          {state.conflict.suggestions.length > 0 && (
            <>
              <p className="callout__text">推荐替代方案：</p>
              <div className="callout__actions">
                {state.conflict.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="btn btn--small font-mono"
                    onClick={() => void commit(suggestion)}
                  >
                    {formatAccel(suggestion)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {state.phase === 'error' && (
        <div className="callout callout--error" role="alert">
          <p className="callout__text font-mono">{state.message}</p>
        </div>
      )}
    </div>
  );
}
