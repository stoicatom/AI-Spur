import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, type Config } from '../shared/config';

// All Rust access goes through shared/ipc, so that is the only seam to mock
// (R-TEST-005 forbids real invoke calls in component tests).
vi.mock('../shared/ipc', () => ({
  listSkins: vi.fn(),
  activateSkin: vi.fn(),
  checkHotkeyConflict: vi.fn(),
}));

import { listSkins, activateSkin, checkHotkeyConflict } from '../shared/ipc';
import { PhrasesPanel } from '../settings/components/PhrasesPanel';
import { SkinsPanel } from '../settings/components/SkinsPanel';
import { AnimationPanel } from '../settings/components/AnimationPanel';
import { SoundsPanel } from '../settings/components/SoundsPanel';
import { StatsPanel } from '../settings/components/StatsPanel';
import { HotkeyRecorder } from '../settings/components/HotkeyRecorder';

function cfg(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

const skinFixture = {
  specVersion: '1' as const,
  id: 'default',
  name: 'Classic',
  description: 'The original look.',
  visuals: {
    handleColor: '#111111',
    bodyGradient: ['#111111', '#333333'] as [string, string],
    tipGlow: false,
    particleEffect: 'none' as const,
    outlineColor: '#ffffff',
    bgAlpha: 0.011,
  },
  sounds: { crack: ['A.mp3'], whoosh: [] },
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('PhrasesPanel', () => {
  it('renders one input per phrase', () => {
    render(<PhrasesPanel config={cfg({ phrases: ['A', 'B'] })} onPatch={vi.fn()} />);
    expect(screen.getByLabelText('提示词 1')).toHaveValue('A');
    expect(screen.getByLabelText('提示词 2')).toHaveValue('B');
  });

  it('disables delete when only one phrase remains', () => {
    render(<PhrasesPanel config={cfg({ phrases: ['ONLY'] })} onPatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: '删除提示词 1' })).toBeDisabled();
  });

  it('enables delete once there are two phrases', () => {
    render(<PhrasesPanel config={cfg({ phrases: ['A', 'B'] })} onPatch={vi.fn()} />);
    expect(screen.getByRole('button', { name: '删除提示词 1' })).toBeEnabled();
  });

  it('removes the chosen phrase', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<PhrasesPanel config={cfg({ phrases: ['A', 'B', 'C'] })} onPatch={onPatch} />);

    await user.click(screen.getByRole('button', { name: '删除提示词 2' }));
    expect(onPatch).toHaveBeenCalledWith({ phrases: ['A', 'C'] });
  });

  it('edits a phrase in place', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<PhrasesPanel config={cfg({ phrases: ['A'] })} onPatch={onPatch} />);

    await user.type(screen.getByLabelText('提示词 1'), 'X');
    expect(onPatch).toHaveBeenCalledWith({ phrases: ['AX'] });
  });

  it('adds a trimmed phrase and clears the draft', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<PhrasesPanel config={cfg({ phrases: ['A'] })} onPatch={onPatch} />);

    const draft = screen.getByLabelText('新提示词');
    await user.type(draft, '  NEW  ');
    await user.click(screen.getByRole('button', { name: '添加' }));

    expect(onPatch).toHaveBeenCalledWith({ phrases: ['A', 'NEW'] });
    expect(draft).toHaveValue('');
  });

  it('adds on Enter as well as the button', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<PhrasesPanel config={cfg({ phrases: ['A'] })} onPatch={onPatch} />);

    await user.type(screen.getByLabelText('新提示词'), 'VIA-ENTER{Enter}');
    expect(onPatch).toHaveBeenCalledWith({ phrases: ['A', 'VIA-ENTER'] });
  });

  it('keeps add disabled for blank input', async () => {
    const user = userEvent.setup();
    render(<PhrasesPanel config={cfg({ phrases: ['A'] })} onPatch={vi.fn()} />);

    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();
    await user.type(screen.getByLabelText('新提示词'), '   ');
    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();
  });

  it('blocks adding past the 20-phrase cap', () => {
    const full = Array.from({ length: 20 }, (_, i) => `P${i}`);
    render(<PhrasesPanel config={cfg({ phrases: full })} onPatch={vi.fn()} />);

    expect(screen.getByLabelText('新提示词')).toBeDisabled();
    expect(screen.getByText(/已达上限 20 条/)).toBeInTheDocument();
  });
});

describe('SkinsPanel', () => {
  it('shows a loading hint before skins arrive', () => {
    vi.mocked(listSkins).mockReturnValue(new Promise(() => {}));
    render(<SkinsPanel config={cfg()} onPatch={vi.fn()} />);
    expect(screen.getByText('正在读取皮肤列表…')).toBeInTheDocument();
  });

  it('marks the active skin as checked', async () => {
    vi.mocked(listSkins).mockResolvedValue([
      skinFixture,
      { ...skinFixture, id: 'fire', name: 'Fire Whip' },
    ]);
    render(<SkinsPanel config={cfg({ activeSkin: 'fire' })} onPatch={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('radio', { name: /Fire Whip/ })).toBeChecked());
    expect(screen.getByRole('radio', { name: /Classic/ })).not.toBeChecked();
  });

  it('activates a skin and mirrors it locally', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    vi.mocked(listSkins).mockResolvedValue([
      skinFixture,
      { ...skinFixture, id: 'neon', name: 'Neon' },
    ]);
    vi.mocked(activateSkin).mockResolvedValue(undefined);

    render(<SkinsPanel config={cfg()} onPatch={onPatch} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Neon/ })).toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: /Neon/ }));

    await waitFor(() => expect(activateSkin).toHaveBeenCalledWith('neon'));
    expect(onPatch).toHaveBeenCalledWith({ activeSkin: 'neon' });
  });

  it('surfaces a load failure instead of rendering an empty grid', async () => {
    vi.mocked(listSkins).mockRejectedValue(new Error('skins dir unreadable'));
    render(<SkinsPanel config={cfg()} onPatch={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('skins dir unreadable')).toBeInTheDocument();
  });

  it('surfaces an activation failure and leaves config untouched', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    vi.mocked(listSkins).mockResolvedValue([skinFixture]);
    vi.mocked(activateSkin).mockRejectedValue(new Error('skin not found'));

    render(<SkinsPanel config={cfg()} onPatch={onPatch} />);
    await waitFor(() => expect(screen.getByRole('radio', { name: /Classic/ })).toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: /Classic/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('skin not found')).toBeInTheDocument();
    expect(onPatch).not.toHaveBeenCalled();
  });
});

describe('AnimationPanel', () => {
  it('checks the active mode', () => {
    render(<AnimationPanel config={cfg({ animationMode: 'fast' })} onPatch={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /快速模式/ })).toBeChecked();
  });

  it('switches mode on selection', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<AnimationPanel config={cfg({ animationMode: 'auto' })} onPatch={onPatch} />);

    await user.click(screen.getByRole('radio', { name: /标准模式/ }));
    expect(onPatch).toHaveBeenCalledWith({ animationMode: 'standard' });
  });

  it('shows the threshold slider only in auto mode', () => {
    const { unmount } = render(
      <AnimationPanel config={cfg({ animationMode: 'auto' })} onPatch={vi.fn()} />
    );
    expect(screen.getByRole('slider')).toBeInTheDocument();
    unmount();

    render(<AnimationPanel config={cfg({ animationMode: 'fast' })} onPatch={vi.fn()} />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('reports the threshold as a number, not a string', () => {
    const onPatch = vi.fn();
    render(
      <AnimationPanel
        config={cfg({ animationMode: 'auto', autoSwitchThreshold: 20 })}
        onPatch={onPatch}
      />
    );

    // fireEvent drives React's synthetic onChange for a range input, which
    // userEvent's typing helpers do not model well.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '35' } });

    expect(onPatch).toHaveBeenCalledWith({ autoSwitchThreshold: 35 });
    // The schema requires an integer; a stringified value would fail Zod.
    expect(typeof onPatch.mock.calls[0][0].autoSwitchThreshold).toBe('number');
  });

  it('always mentions the Shift override', () => {
    render(<AnimationPanel config={cfg()} onPatch={vi.fn()} />);
    expect(screen.getByText(/强制播放完整动画/)).toBeInTheDocument();
  });
});

describe('SoundsPanel', () => {
  it('reflects both toggles', () => {
    render(
      <SoundsPanel config={cfg({ playSound: true, showBorderFlash: false })} onPatch={vi.fn()} />
    );
    expect(screen.getByRole('checkbox', { name: /播放 crack 音效/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /屏幕边缘闪光/ })).not.toBeChecked();
  });

  it('patches playSound on toggle', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<SoundsPanel config={cfg({ playSound: true })} onPatch={onPatch} />);

    await user.click(screen.getByRole('checkbox', { name: /播放 crack 音效/ }));
    expect(onPatch).toHaveBeenCalledWith({ playSound: false });
  });

  it('patches showBorderFlash on toggle', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<SoundsPanel config={cfg({ showBorderFlash: false })} onPatch={onPatch} />);

    await user.click(screen.getByRole('checkbox', { name: /屏幕边缘闪光/ }));
    expect(onPatch).toHaveBeenCalledWith({ showBorderFlash: true });
  });
});

describe('StatsPanel', () => {
  it('displays both counters', () => {
    render(<StatsPanel config={cfg({ usageCount: 42, todayUsageCount: 7 })} onPatch={vi.fn()} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it('omits the last-used line when absent', () => {
    render(<StatsPanel config={cfg({ lastUsageDate: undefined })} onPatch={vi.fn()} />);
    expect(screen.queryByText(/最近一次/)).not.toBeInTheDocument();
  });

  it('shows the last-used date when present', () => {
    render(<StatsPanel config={cfg({ lastUsageDate: '2026-08-12' })} onPatch={vi.fn()} />);
    expect(screen.getByText(/2026-08-12/)).toBeInTheDocument();
  });
});

describe('HotkeyRecorder', () => {
  it('shows the current hotkey when idle', () => {
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);
    // Formatting is platform-dependent; the W is the stable part.
    expect(screen.getByRole('button', { name: '录制全局快捷键' })).toHaveTextContent('W');
  });

  it('enters recording mode on click', async () => {
    const user = userEvent.setup();
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));
    expect(screen.getByText('按下你的快捷键组合…')).toBeInTheDocument();
    expect(screen.getByText('按 Esc 取消录制')).toBeInTheDocument();
  });

  it('commits a captured combination that has no conflict', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(checkHotkeyConflict).mockResolvedValue(null);

    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, shiftKey: true, bubbles: true })
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('CommandOrControl+Shift+E'));
  });

  it('shows suggestions when the combination is taken', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(checkHotkeyConflict).mockResolvedValue({
      hotkey: 'CommandOrControl+Shift+E',
      suggestions: ['CommandOrControl+Shift+F', 'CommandOrControl+Shift+D'],
    });

    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, shiftKey: true, bubbles: true })
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/已被其他应用占用/)).toBeInTheDocument();
    // A conflicting hotkey must not be saved.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels recording on Escape', async () => {
    const user = userEvent.setup();
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    await waitFor(() =>
      expect(screen.queryByText('按下你的快捷键组合…')).not.toBeInTheDocument()
    );
    expect(checkHotkeyConflict).not.toHaveBeenCalled();
  });

  it('keeps recording while only modifiers are held', async () => {
    const user = userEvent.setup();
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true }));

    expect(screen.getByText('按下你的快捷键组合…')).toBeInTheDocument();
    expect(checkHotkeyConflict).not.toHaveBeenCalled();
  });

  it('surfaces a conflict-check failure', async () => {
    const user = userEvent.setup();
    vi.mocked(checkHotkeyConflict).mockRejectedValue(new Error('shortcut plugin unavailable'));

    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, shiftKey: true, bubbles: true })
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('shortcut plugin unavailable')).toBeInTheDocument();
  });
});
