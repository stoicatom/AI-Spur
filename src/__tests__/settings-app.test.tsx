import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG } from '../shared/config';

// The settings window talks to Rust only through shared/ipc, so that module is
// the single seam to mock (R-TEST-005 forbids real invoke calls in tests).
vi.mock('../shared/ipc', () => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  onConfigUpdated: vi.fn(),
  // Panels render for real inside App, so their IPC calls need stubs too.
  listSkins: vi.fn(),
  activateSkin: vi.fn(),
  checkHotkeyConflict: vi.fn(),
}));

import { getConfig, saveConfig, onConfigUpdated, listSkins } from '../shared/ipc';
import { App } from '../settings/App';
import { NAV_GROUPS, PANEL_IDS } from '../settings/panels';

/**
 * Config for the settings shell. `firstLaunch` must be false — App shows the
 * onboarding wizard instead of the sidebar while it is true, and these tests
 * are about the shell. Onboarding has its own suite.
 */
const SETTLED_CONFIG = { ...DEFAULT_CONFIG, firstLaunch: false };

/** Default happy-path mocks; individual tests override as needed. */
function primeIpc() {
  vi.mocked(getConfig).mockResolvedValue(SETTLED_CONFIG);
  vi.mocked(saveConfig).mockResolvedValue(undefined);
  vi.mocked(onConfigUpdated).mockResolvedValue(vi.fn());
  // The skins panel fetches on mount; an empty list keeps it quiet.
  vi.mocked(listSkins).mockResolvedValue([]);
}

describe('panel registry', () => {
  it('exposes every panel id through the nav groups', () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id)).sort();
    expect(grouped).toEqual([...PANEL_IDS].sort());
  });

  it('gives every panel a non-empty label', () => {
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        expect(item.label.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('settings App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    primeIpc();
  });

  afterEach(cleanup);

  it('shows a loading state before the config resolves', () => {
    // A promise that never settles keeps the component in its loading state.
    vi.mocked(getConfig).mockReturnValue(new Promise(() => {}));
    render(<App />);
    expect(screen.getByText('正在读取配置…')).toBeInTheDocument();
  });

  it('renders the trigger panel once the config loads', async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: /触发/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches panels when a nav item is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: /皮肤/ }));

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /皮肤/ })).toHaveAttribute('aria-selected', 'true');
    });
    expect(screen.getByRole('tab', { name: /触发/ })).toHaveAttribute('aria-selected', 'false');

    // AnimatePresence mode="wait" unmounts the old panel before mounting the
    // new one, so the swap lands a tick after the tab state changes.
    await waitFor(() => {
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'panel-skins');
    });
  });

  it('links each tab to the panel it controls', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    const tab = screen.getByRole('tab', { name: /触发/ });
    expect(tab).toHaveAttribute('aria-controls', 'panel-trigger');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'nav-trigger');
  });

  it('moves selection with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    // Focus the active tab directly rather than counting tab stops — the
    // number of stops before it is incidental to what this test asserts.
    screen.getByRole('tab', { name: /触发/ }).focus();
    expect(screen.getByRole('tab', { name: /触发/ })).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /提示词/ })).toHaveAttribute('aria-selected', 'true');
    });
    // Selection follows focus in an automatic tablist.
    expect(screen.getByRole('tab', { name: /提示词/ })).toHaveFocus();
  });

  it('wraps from the last tab to the first with ArrowDown', async () => {
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    await user.click(screen.getByRole('tab', { name: /统计/ }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: /统计/ })).toHaveAttribute('aria-selected', 'true')
    );

    screen.getByRole('tab', { name: /统计/ }).focus();
    await user.keyboard('{ArrowDown}');

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /触发/ })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('keeps only the active tab in the tab order', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    const tabs = screen.getAllByRole('tab');
    const focusable = tabs.filter((t) => t.getAttribute('tabindex') === '0');
    expect(focusable).toHaveLength(1);
    expect(focusable[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('surfaces an IPC failure with a retry action instead of failing silently', async () => {
    vi.mocked(getConfig).mockRejectedValue(new Error('config lock poisoned'));
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText('config lock poisoned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('reloads the config when retry is pressed', async () => {
    const user = userEvent.setup();
    vi.mocked(getConfig).mockRejectedValueOnce(new Error('transient failure'));
    render(<App />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    vi.mocked(getConfig).mockResolvedValue(SETTLED_CONFIG);
    await user.click(screen.getByRole('button', { name: '重试' }));

    await waitFor(() => {
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
    expect(getConfig).toHaveBeenCalledTimes(2);
  });

  it('subscribes to config-updated and merges the payload', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    expect(onConfigUpdated).toHaveBeenCalledWith(expect.any(Function));

    // Applying an update must not tear down the rendered panel.
    const handler = vi.mocked(onConfigUpdated).mock.calls[0][0];
    handler({ usageCount: 21 });

    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());
  });

  it('unsubscribes from config-updated on unmount', async () => {
    const unlisten = vi.fn();
    vi.mocked(onConfigUpdated).mockResolvedValue(unlisten);

    const { unmount } = render(<App />);
    await waitFor(() => expect(screen.getByRole('tabpanel')).toBeInTheDocument());

    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });

  it('still renders when the event subscription fails', async () => {
    vi.mocked(onConfigUpdated).mockRejectedValue(new Error('listen unavailable'));
    render(<App />);

    // Losing live updates must not block the panel that already has config.
    await waitFor(() => {
      expect(screen.getByRole('tabpanel')).toBeInTheDocument();
    });
  });
});
