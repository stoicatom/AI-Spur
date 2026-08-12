import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG, type Config } from '../shared/config';

vi.mock('../shared/ipc', () => ({
  listSkins: vi.fn(),
  activateSkin: vi.fn(),
  checkHotkeyConflict: vi.fn(),
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  onConfigUpdated: vi.fn(),
}));

import { listSkins, checkHotkeyConflict, getConfig, saveConfig, onConfigUpdated } from '../shared/ipc';
import { OnboardingFlow } from '../onboarding/OnboardingFlow';
import { App } from '../settings/App';

function cfg(overrides: Partial<Config> = {}): Config {
  return { ...DEFAULT_CONFIG, ...overrides };
}

const skinFixture = {
  specVersion: '1' as const,
  id: 'default',
  name: 'Classic',
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listSkins).mockResolvedValue([skinFixture]);
  vi.mocked(checkHotkeyConflict).mockResolvedValue(null);
});
afterEach(cleanup);

/** Walk the wizard to its final step. */
async function goToLastStep(user: ReturnType<typeof userEvent.setup>) {
  // Wait on each step's heading, not the progress counter: AnimatePresence
  // mode="wait" swaps the body a tick after the step state changes, so the
  // counter updates while the previous step is still mounted.
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await waitFor(() => expect(screen.getByText('选择提示词')).toBeInTheDocument());
  await user.click(screen.getByRole('button', { name: '下一步' }));
  await waitFor(() => expect(screen.getByText('选择皮肤，然后开始')).toBeInTheDocument());
}

describe('OnboardingFlow', () => {
  it('starts on the hotkey step', () => {
    render(<OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('设置全局快捷键')).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument();
  });

  it('reports progress to assistive tech', () => {
    render(<OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={vi.fn()} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  it('advances through all three steps', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(screen.getByText('选择提示词')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(screen.getByText('选择皮肤，然后开始')).toBeInTheDocument());
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '3');
  });

  it('goes back to the previous step', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(screen.getByText('选择提示词')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '上一步' }));
    await waitFor(() => expect(screen.getByText('设置全局快捷键')).toBeInTheDocument());
  });

  it('offers skip only on the first step', async () => {
    const user = userEvent.setup();
    render(<OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByRole('button', { name: '跳过' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(screen.getByText('选择提示词')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '跳过' })).not.toBeInTheDocument();
  });

  it('calls onSkip when skipping', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={onSkip} />);

    await user.click(screen.getByRole('button', { name: '跳过' }));
    await waitFor(() => expect(onSkip).toHaveBeenCalled());
  });

  it('persists the collected settings with firstLaunch cleared', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingFlow config={cfg()} onComplete={onComplete} onSkip={vi.fn()} />);

    await goToLastStep(user);
    await user.click(screen.getByRole('button', { name: '开始使用' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const patch = onComplete.mock.calls[0][0];
    expect(patch.firstLaunch).toBe(false);
    expect(patch.hotkey).toBe(DEFAULT_CONFIG.hotkey);
    expect(patch.phrases.length).toBeGreaterThan(0);
  });

  it('deselects a phrase but keeps the last one', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingFlow config={cfg()} onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '下一步' }));
    await waitFor(() => expect(screen.getByText('选择提示词')).toBeInTheDocument());

    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(4);

    // Uncheck three; the fourth must become disabled rather than allow zero.
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(boxes[2]);

    await waitFor(() => expect(screen.getByText('至少保留一条提示词。')).toBeInTheDocument());
    const remaining = screen.getAllByRole('checkbox').filter((b) => (b as HTMLInputElement).checked);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBeDisabled();
  });

  it('carries a re-recorded hotkey into the saved patch', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingFlow config={cfg()} onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '录制全局快捷键' }));
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, shiftKey: true, bubbles: true })
    );
    await waitFor(() => expect(checkHotkeyConflict).toHaveBeenCalled());

    await goToLastStep(user);
    await user.click(screen.getByRole('button', { name: '开始使用' }));

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(onComplete.mock.calls[0][0].hotkey).toBe('CommandOrControl+Shift+J');
  });

  it('surfaces a save failure and stays in the wizard', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockRejectedValue(new Error('disk full'));
    render(<OnboardingFlow config={cfg()} onComplete={onComplete} onSkip={vi.fn()} />);

    await goToLastStep(user);
    await user.click(screen.getByRole('button', { name: '开始使用' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('disk full')).toBeInTheDocument();
    // Still on the last step, so the user can retry.
    expect(screen.getByRole('button', { name: '开始使用' })).toBeInTheDocument();
  });

  it('shows the chosen hotkey in the how-it-works list', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <OnboardingFlow config={cfg()} onComplete={vi.fn()} onSkip={vi.fn()} />
    );

    await goToLastStep(user);

    // Each instruction line interleaves a <span> for the hotkey, so assert
    // against the list's combined textContent, not a single text node.
    const steps = container.querySelector('ol');
    expect(steps?.textContent).toContain('召唤鞭子');
    expect(steps?.textContent).toContain('自动发送中断信号');

    const note = container.querySelector('.callout--info');
    expect(note?.textContent).toContain(
      `${DEFAULT_CONFIG.autoSwitchThreshold} 次`
    );
  });

  it('lets onboarding finish even when the skin list fails', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn().mockResolvedValue(undefined);
    vi.mocked(listSkins).mockRejectedValue(new Error('skins unavailable'));

    render(<OnboardingFlow config={cfg()} onComplete={onComplete} onSkip={vi.fn()} />);
    await goToLastStep(user);

    await user.click(screen.getByRole('button', { name: '开始使用' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});

describe('App onboarding gate', () => {
  beforeEach(() => {
    vi.mocked(saveConfig).mockResolvedValue(undefined);
    vi.mocked(onConfigUpdated).mockResolvedValue(vi.fn());
  });

  it('shows onboarding instead of the sidebar on first launch', async () => {
    vi.mocked(getConfig).mockResolvedValue(cfg({ firstLaunch: true }));
    render(<App />);

    await waitFor(() => expect(screen.getByText('设置全局快捷键')).toBeInTheDocument());
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows the normal settings shell once onboarding is done', async () => {
    vi.mocked(getConfig).mockResolvedValue(cfg({ firstLaunch: false }));
    render(<App />);

    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
    expect(screen.queryByText('设置全局快捷键')).not.toBeInTheDocument();
  });

  it('saves immediately when onboarding completes, then reveals the shell', async () => {
    const user = userEvent.setup();
    vi.mocked(getConfig).mockResolvedValue(cfg({ firstLaunch: true }));
    render(<App />);

    await waitFor(() => expect(screen.getByText('设置全局快捷键')).toBeInTheDocument());
    await goToLastStep(user);
    await user.click(screen.getByRole('button', { name: '开始使用' }));

    // Not debounced — the wizard's result must be durable before it unmounts.
    await waitFor(() => expect(saveConfig).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveConfig).mock.calls[0][0].firstLaunch).toBe(false);
    await waitFor(() => expect(screen.getByRole('tablist')).toBeInTheDocument());
  });
});
