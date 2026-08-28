import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, type Config } from '../shared/config';

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
// All Rust access goes through shared/ipc, so that is the only seam to mock
// (R-TEST-005 forbids real invoke calls in component tests).
vi.mock('../shared/ipc', () => ({
  checkHotkeyConflict: vi.fn(),
}));

import { checkHotkeyConflict } from '../shared/ipc';
import { PhrasesPanel } from '../settings/components/PhrasesPanel';
import { AnimationPanel } from '../settings/components/AnimationPanel';
import { SoundsPanel } from '../settings/components/SoundsPanel';
import { StatsPanel } from '../settings/components/StatsPanel';
import { HotkeyRecorder } from '../settings/components/HotkeyRecorder';
import { TriggerPanel } from '../settings/components/TriggerPanel';

function cfg(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

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

  it('does not persist a temporarily empty phrase while editing', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<PhrasesPanel config={cfg({ phrases: ['A'] })} onPatch={onPatch} />);

    const input = screen.getByLabelText('提示词 1');
    await user.clear(input);

    expect(input).toHaveValue('');
    expect(onPatch).not.toHaveBeenCalled();

    await user.type(input, 'REPLACED');
    expect(onPatch).toHaveBeenLastCalledWith({ phrases: ['REPLACED'] });
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

describe('TriggerPanel window presence', () => {
  it('renders the window entry policy as a radio group', () => {
    render(<TriggerPanel config={cfg({ windowPresence: 'persistent' })} onPatch={vi.fn()} />);

    expect(screen.getByRole('radiogroup', { name: '窗口入口策略' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /纯托盘/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /保持 Dock\/任务栏入口/ })).toBeChecked();
  });

  it('patches windowPresence when an option is selected', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<TriggerPanel config={cfg({ windowPresence: 'tray' })} onPatch={onPatch} />);

    await user.click(screen.getByRole('radio', { name: /保持 Dock\/任务栏入口/ }));

    expect(onPatch).toHaveBeenCalledWith({ windowPresence: 'persistent' });
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
    // The sensitivity slider is always present, so locate the threshold one by
    // its label rather than by role (which would match both sliders).
    const { unmount } = render(
      <AnimationPanel config={cfg({ animationMode: 'auto' })} onPatch={vi.fn()} />
    );
    expect(screen.getByLabelText(/切换阈值/)).toBeInTheDocument();
    unmount();

    render(<AnimationPanel config={cfg({ animationMode: 'fast' })} onPatch={vi.fn()} />);
    expect(screen.queryByLabelText(/切换阈值/)).not.toBeInTheDocument();
    // The sensitivity slider remains regardless of mode.
    expect(screen.getByLabelText(/crack 灵敏度/)).toBeInTheDocument();
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
    // userEvent's typing helpers do not model well. Pin the threshold slider
    // by label since the sensitivity slider shares the `range` role.
    fireEvent.change(screen.getByLabelText(/切换阈值/), { target: { value: '35' } });

    expect(onPatch).toHaveBeenCalledWith({ autoSwitchThreshold: 35 });
    // The schema requires an integer; a stringified value would fail Zod.
    expect(typeof onPatch.mock.calls[0][0].autoSwitchThreshold).toBe('number');
  });

  it('patches crackSensitivity as a number when the slider moves', () => {
    const onPatch = vi.fn();
    render(<AnimationPanel config={cfg({ animationMode: 'standard' })} onPatch={onPatch} />);

    fireEvent.change(screen.getByLabelText(/crack 灵敏度/), { target: { value: '1.5' } });

    expect(onPatch).toHaveBeenCalledWith({ crackSensitivity: 1.5 });
    expect(typeof onPatch.mock.calls[0][0].crackSensitivity).toBe('number');
  });

  it('shows the sensitivity as a percentage', () => {
    render(<AnimationPanel config={cfg({ crackSensitivity: 1.5 })} onPatch={vi.fn()} />);
    // 1.5 → 150%
    expect(screen.getByText('150%')).toBeInTheDocument();
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
    expect(screen.getByRole('checkbox', { name: /播放程序化音效/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /屏幕边缘闪光/ })).not.toBeChecked();
  });

  it('patches playSound on toggle', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<SoundsPanel config={cfg({ playSound: true })} onPatch={onPatch} />);

    await user.click(screen.getByRole('checkbox', { name: /播放程序化音效/ }));
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

    await act(async () => window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, shiftKey: true, bubbles: true })
    ));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('CommandOrControl+Shift+E'));
  });

  it('commits Cmd/Ctrl+Shift+5 captured from the physical key code', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(checkHotkeyConflict).mockResolvedValue(null);

    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    await act(async () => window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '5',
        code: 'Digit5',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      })
    ));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('CommandOrControl+Shift+5'));
  });

  it('keeps recording when the browser reports an unsupported key code', async () => {
    const user = userEvent.setup();
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    await act(async () => window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Unidentified',
        code: 'UnknownKey',
        ctrlKey: true,
        bubbles: true,
      })
    ));

    expect(screen.getByText('按下你的快捷键组合…')).toBeInTheDocument();
    expect(checkHotkeyConflict).not.toHaveBeenCalled();
  });

  it('shows suggestions when the combination is taken', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    vi.mocked(checkHotkeyConflict).mockResolvedValue({
      hotkey: 'CommandOrControl+Shift+E',
      suggestions: ['CommandOrControl+Shift+F', 'CommandOrControl+Shift+D'],
      scope: 'primary',
      occupiedBy: '其他应用',
      occupiedHotkey: 'CommandOrControl+Shift+E',
      previousHotkey: 'CommandOrControl+Shift+W',
    });

    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    await act(async () => window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, shiftKey: true, bubbles: true })
    ));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/已被其他应用占用/)).toBeInTheDocument();
    // A conflicting hotkey must not be saved.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels recording on Escape', async () => {
    const user = userEvent.setup();
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));

    await waitFor(() =>
      expect(screen.queryByText('按下你的快捷键组合…')).not.toBeInTheDocument()
    );
    expect(checkHotkeyConflict).not.toHaveBeenCalled();
  });

  it('keeps recording while only modifiers are held', async () => {
    const user = userEvent.setup();
    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true })));

    expect(screen.getByText('按下你的快捷键组合…')).toBeInTheDocument();
    expect(checkHotkeyConflict).not.toHaveBeenCalled();
  });

  it('surfaces a conflict-check failure', async () => {
    const user = userEvent.setup();
    vi.mocked(checkHotkeyConflict).mockRejectedValue(new Error('shortcut plugin unavailable'));

    render(<HotkeyRecorder value="CommandOrControl+Shift+W" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));

    await act(async () => window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'e', ctrlKey: true, shiftKey: true, bubbles: true })
    ));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('shortcut plugin unavailable')).toBeInTheDocument();
  });
});
