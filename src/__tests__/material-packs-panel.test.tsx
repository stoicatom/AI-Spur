import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_CONFIG } from '../shared/config';
import type { MaterialPack } from '../shared/material-packs';

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

vi.mock('../shared/ipc', () => ({
  listPacks: vi.fn(),
  setActivePack: vi.fn(),
  deleteCustomPack: vi.fn(),
  createCustomPack: vi.fn(),
}));

import { listPacks, setActivePack } from '../shared/ipc';
import { MaterialPacksPanel } from '../settings/components/MaterialPacksPanel';

function pack(id: string, name: string, preset: MaterialPack['effect']['preset']): MaterialPack {
  return {
    id,
    name,
    builtin: true,
    imageFile: 'icon.svg',
    dataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
    effect: { preset, params: {} },
    sound: {
      masterGain: 0.8,
      layers: [{ type: 'impact', attack: 0.01, decay: 0.3, gain: 0.8, delay: 0 }],
    },
    palette: { bodyGradient: ['#101820', '#f2aa4c'], particleHue: 32 },
  };
}

const PACKS = [
  pack('rocket', '火箭', 'jet'),
  pack('tornado', '龙卷风', 'tornado'),
  pack('downpour', '满屏飘雨', 'downpour'),
  pack('piano', '钢琴', 'note-dance'),
  pack('revolver', '左轮手枪', 'gunshot'),
];

function renderPanel(activePackId = 'rocket', onPatch = vi.fn()) {
  return {
    onPatch,
    ...render(
      <MaterialPacksPanel
        config={{ ...DEFAULT_CONFIG, activePackId }}
        onPatch={onPatch}
      />,
    ),
  };
}

async function packGrid() {
  return screen.findByRole('radiogroup', { name: '素材包' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPacks).mockResolvedValue(PACKS);
  vi.mocked(setActivePack).mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('MaterialPacksPanel 素材浏览交互', () => {
  it('按系列筛选素材，并同步系列选中状态', async () => {
    const user = userEvent.setup();
    renderPanel();
    const grid = await packGrid();
    const familyGroup = screen.getByRole('radiogroup', { name: '素材系列' });

    await user.click(within(familyGroup).getByRole('radio', { name: /^自然/ }));

    expect(within(familyGroup).getByRole('radio', { name: /^自然/ })).toBeChecked();
    expect(within(grid).getAllByRole('radio')).toHaveLength(2);
    expect(within(grid).getByRole('radio', { name: /龙卷风/ })).toHaveAttribute('tabindex', '0');
    expect(within(grid).getByRole('radio', { name: /满屏飘雨/ })).toHaveAttribute('tabindex', '-1');
    expect(within(grid).queryByRole('radio', { name: /钢琴/ })).not.toBeInTheDocument();
  });

  it('用方向键、Home 和 End 管理系列单选组的选择与焦点', async () => {
    const user = userEvent.setup();
    renderPanel();
    await packGrid();
    const familyGroup = screen.getByRole('radiogroup', { name: '素材系列' });
    const all = within(familyGroup).getByRole('radio', { name: /^全部/ });
    const nature = within(familyGroup).getByRole('radio', { name: /^自然/ });
    const other = within(familyGroup).getByRole('radio', { name: /^其他/ });

    expect(all).toHaveAttribute('tabindex', '0');
    expect(nature).toHaveAttribute('tabindex', '-1');

    all.focus();
    await user.keyboard('{ArrowDown}');
    expect(nature).toHaveFocus();
    expect(nature).toBeChecked();
    expect(nature).toHaveAttribute('tabindex', '0');
    expect(all).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowUp}');
    expect(all).toHaveFocus();
    expect(all).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(other).toHaveFocus();
    expect(other).toBeChecked();

    await user.keyboard('{Home}');
    expect(all).toHaveFocus();
    expect(all).toBeChecked();

    await user.keyboard('{ArrowRight}');
    expect(nature).toHaveFocus();
    expect(nature).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(all).toHaveFocus();
    expect(all).toBeChecked();

    await user.keyboard('{End}');
    expect(other).toHaveFocus();
    expect(other).toBeChecked();
  });

  it('可按素材名称、特效或物理模式搜索', async () => {
    const user = userEvent.setup();
    renderPanel();
    const grid = await packGrid();
    const search = screen.getByRole('textbox', { name: '搜索素材名称、特效或物理模式' });

    await user.type(search, '枪击');

    expect(within(grid).getAllByRole('radio')).toHaveLength(1);
    expect(within(grid).getByRole('radio', { name: /左轮手枪/ })).toHaveAttribute('tabindex', '0');
  });

  it('清除搜索后恢复当前系列下的全部素材', async () => {
    const user = userEvent.setup();
    renderPanel();
    const grid = await packGrid();
    const familyGroup = screen.getByRole('radiogroup', { name: '素材系列' });

    await user.click(within(familyGroup).getByRole('radio', { name: /^自然/ }));
    await user.type(
      screen.getByRole('textbox', { name: '搜索素材名称、特效或物理模式' }),
      '龙卷风',
    );
    expect(within(grid).getAllByRole('radio')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: '清除搜索' }));

    expect(screen.getByRole('textbox', { name: '搜索素材名称、特效或物理模式' })).toHaveValue('');
    expect(within(grid).getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: '清除搜索' })).not.toBeInTheDocument();
  });

  it('展示当前激活素材，并在选择后请求激活及更新配置', async () => {
    const user = userEvent.setup();
    const { onPatch, rerender } = renderPanel();
    const grid = await packGrid();
    const rocket = within(grid).getByRole('radio', { name: /火箭/ });
    const piano = within(grid).getByRole('radio', { name: /钢琴/ });

    expect(rocket).toBeChecked();
    expect(piano).not.toBeChecked();
    expect(screen.getByText('火箭', { selector: '.pack-toolbar__active strong' })).toBeInTheDocument();

    await user.click(piano);

    await waitFor(() => expect(setActivePack).toHaveBeenCalledWith('piano'));
    expect(onPatch).toHaveBeenCalledWith({ activePackId: 'piano' });

    rerender(
      <MaterialPacksPanel
        config={{ ...DEFAULT_CONFIG, activePackId: 'piano' }}
        onPatch={onPatch}
      />,
    );
    expect(piano).toBeChecked();
    expect(rocket).not.toBeChecked();
    expect(screen.getByText('钢琴', { selector: '.pack-toolbar__active strong' })).toBeInTheDocument();
  });

  it('用方向键、Home 和 End 管理素材单选组的选择与焦点', async () => {
    const user = userEvent.setup();
    renderPanel();
    const grid = await packGrid();
    const rocket = within(grid).getByRole('radio', { name: /火箭/ });
    const tornado = within(grid).getByRole('radio', { name: /龙卷风/ });
    const revolver = within(grid).getByRole('radio', { name: /左轮手枪/ });

    expect(rocket).toHaveAttribute('tabindex', '0');
    expect(tornado).toHaveAttribute('tabindex', '-1');

    rocket.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('tornado'));
    expect(tornado).toHaveFocus();
    expect(tornado).toHaveAttribute('tabindex', '0');
    expect(rocket).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowLeft}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('rocket'));
    expect(rocket).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('tornado'));
    expect(tornado).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('rocket'));
    expect(rocket).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('revolver'));
    expect(revolver).toHaveFocus();

    await user.keyboard('{Home}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('rocket'));
    expect(rocket).toHaveFocus();

    await user.keyboard('{End}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('revolver'));
    expect(revolver).toHaveFocus();
  });
});
