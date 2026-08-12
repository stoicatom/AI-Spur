import { useState } from 'react';
import type { PanelProps } from './panel-props';

const MAX_PHRASES = 20;

export function PhrasesPanel({ config, onPatch }: PanelProps) {
  const [draft, setDraft] = useState('');
  const phrases = config.phrases;
  const atCapacity = phrases.length >= MAX_PHRASES;
  const canDelete = phrases.length > 1;

  function addPhrase() {
    const trimmed = draft.trim();
    if (!trimmed || atCapacity) return;
    onPatch({ phrases: [...phrases, trimmed] });
    setDraft('');
  }

  function updatePhrase(index: number, next: string) {
    const updated = phrases.map((p, i) => (i === index ? next : p));
    onPatch({ phrases: updated });
  }

  function removePhrase(index: number) {
    // The schema requires at least one phrase; the button is disabled at one.
    if (!canDelete) return;
    onPatch({ phrases: phrases.filter((_, i) => i !== index) });
  }

  return (
    <div className="field-stack">
      <section className="field">
        <h2 className="field__label">提示词列表</h2>
        <p className="field__desc">
          每次 crack 会随机选取一条发送。最多 {MAX_PHRASES} 条，至少保留 1 条。
        </p>

        <ul className="phrase-list">
          {phrases.map((phrase, index) => (
            <li className="phrase-row" key={index}>
              <input
                className="input phrase-row__input"
                value={phrase}
                aria-label={`提示词 ${index + 1}`}
                onChange={(e) => updatePhrase(index, e.target.value)}
              />
              <button
                type="button"
                className="btn btn--small btn--danger"
                onClick={() => removePhrase(index)}
                disabled={!canDelete}
                aria-label={`删除提示词 ${index + 1}`}
              >
                删除
              </button>
            </li>
          ))}
        </ul>

        <div className="phrase-add">
          <input
            className="input"
            placeholder="输入新的提示词…"
            value={draft}
            aria-label="新提示词"
            disabled={atCapacity}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addPhrase();
              }
            }}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={addPhrase}
            disabled={atCapacity || draft.trim().length === 0}
          >
            添加
          </button>
        </div>

        {atCapacity && (
          <p className="field-hint field-hint--warning">
            已达上限 {MAX_PHRASES} 条，删除一条后才能继续添加。
          </p>
        )}
      </section>
    </div>
  );
}
