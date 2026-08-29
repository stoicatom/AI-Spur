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
  updateCustomPack: vi.fn(),
}));

// 向导本身由 CreatePackWizard 的测试覆盖；这里只需要它的模式与成功回调。
vi.mock('../settings/components/CreatePackWizard', () => ({
  CreatePackWizard: ({ editing, onSaved, onClose }: { editing?: MaterialPack; onSaved: (pack: MaterialPack) => void; onClose: () => void }) => (
    <div role="dialog" aria-label={editing ? '编辑素材包' : '新建素材包'}>
      {editing && <span data-testid="editing-id">{editing.id}</span>}
      <button type="button" onClick={() => onSaved(editing ?? CREATED_PACK)}>模拟保存完成</button>
      <button type="button" onClick={onClose}>模拟关闭</button>
    </div>
  ),
}));

import { listPacks, setActivePack, deleteCustomPack } from '../shared/ipc';
import { MaterialPacksPanel } from '../settings/components/MaterialPacksPanel';

function pack(
  id: string,
  name: string,
  preset: MaterialPack['effect']['preset'],
  builtin = true,
): MaterialPack {
  return {
    id,
    name,
    builtin,
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

// Rust 侧按 id 返回内置包在前、自定义包在后；面板负责把自定义包提到顶部。
const PACKS = [
  pack('rocket', '火箭', 'jet'),
  pack('tornado', '龙卷风', 'tornado'),
  pack('downpour', '满屏飘雨', 'downpour'),
  pack('piano', '钢琴', 'note-dance'),
  pack('revolver', '左轮手枪', 'gunshot'),
  pack('my-forge-l3k9', '我的锻炉', 'impact', false),
  pack('my-anvil-m2p4', '我的铁砧', 'burst', false),
];

const BUILTIN_ONLY = PACKS.filter((item) => item.builtin);
const CREATED_PACK = pack('my-hammer-q7z1', '我的铁锤', 'impact', false);

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
  return screen.findByRole('radiogroup', { name: '素材库' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPacks).mockResolvedValue(PACKS);
  vi.mocked(setActivePack).mockResolvedValue(undefined);
  vi.mocked(deleteCustomPack).mockResolvedValue(undefined);
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
    const mine = within(familyGroup).getByRole('radio', { name: /^我的/ });
    const nature = within(familyGroup).getByRole('radio', { name: /^自然/ });
    const other = within(familyGroup).getByRole('radio', { name: /^其他/ });

    expect(all).toHaveAttribute('tabindex', '0');
    expect(mine).toHaveAttribute('tabindex', '-1');

    // 「我的素材」紧跟「全部」，是列表中的第二个系列。
    all.focus();
    await user.keyboard('{ArrowDown}');
    expect(mine).toHaveFocus();
    expect(mine).toBeChecked();
    expect(mine).toHaveAttribute('tabindex', '0');
    expect(all).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowDown}');
    expect(nature).toHaveFocus();
    expect(nature).toBeChecked();

    await user.keyboard('{ArrowUp}');
    expect(mine).toHaveFocus();
    expect(mine).toBeChecked();

    await user.keyboard('{Home}');
    expect(all).toHaveFocus();
    expect(all).toBeChecked();

    await user.keyboard('{ArrowLeft}');
    expect(other).toHaveFocus();
    expect(other).toBeChecked();

    await user.keyboard('{ArrowRight}');
    expect(all).toHaveFocus();
    expect(all).toBeChecked();

    await user.keyboard('{ArrowRight}');
    expect(mine).toHaveFocus();
    expect(mine).toBeChecked();

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
    // 排序后网格顺序：我的锻炉 → 我的铁砧 → 火箭 → 龙卷风 → 满屏飘雨 → 钢琴 → 左轮手枪
    const forge = within(grid).getByRole('radio', { name: /我的锻炉/ });
    const anvil = within(grid).getByRole('radio', { name: /我的铁砧/ });
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

    // 火箭之前是自定义素材，向上应落到「我的铁砧」而不是环绕到末尾。
    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('my-anvil-m2p4'));
    expect(anvil).toHaveFocus();

    await user.keyboard('{Home}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('my-forge-l3k9'));
    expect(forge).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('revolver'));
    expect(revolver).toHaveFocus();

    await user.keyboard('{End}');
    await waitFor(() => expect(setActivePack).toHaveBeenLastCalledWith('revolver'));
    expect(revolver).toHaveFocus();
  });
});

describe('MaterialPacksPanel 自定义素材优先', () => {
  it('把用户上传的素材排在网格最前面', async () => {
    renderPanel();
    const grid = await packGrid();

    const names = within(grid)
      .getAllByRole('radio')
      .map((node) => node.querySelector('.pack-card__name')?.textContent);

    expect(names).toEqual(['我的锻炉', '我的铁砧', '火箭', '龙卷风', '满屏飘雨', '钢琴', '左轮手枪']);
  });

  it('「我的」系列只列出自定义素材，且计数与之一致', async () => {
    const user = userEvent.setup();
    renderPanel();
    const grid = await packGrid();
    const familyGroup = screen.getByRole('radiogroup', { name: '素材系列' });
    const mine = within(familyGroup).getByRole('radio', { name: /^我的/ });

    expect(mine).toHaveTextContent('2');

    await user.click(mine);

    expect(mine).toBeChecked();
    const cards = within(grid).getAllByRole('radio');
    expect(cards).toHaveLength(2);
    expect(within(grid).getByRole('radio', { name: /我的锻炉/ })).toBeInTheDocument();
    expect(within(grid).queryByRole('radio', { name: /火箭/ })).not.toBeInTheDocument();
  });

  it('自定义素材卡片标注归属系列并保留删除入口', async () => {
    renderPanel();
    const grid = await packGrid();

    const forge = within(grid).getByRole('radio', { name: /我的锻炉/ });
    expect(forge).toHaveClass('pack-card--custom');
    expect(forge.querySelector('.pack-card__family')).toHaveTextContent('我的素材');
    expect(screen.getByRole('button', { name: '删除 我的锻炉' })).toBeInTheDocument();

    const rocket = within(grid).getByRole('radio', { name: /火箭/ });
    expect(rocket).toHaveClass('pack-card--weapon');
    expect(screen.queryByRole('button', { name: '删除 火箭' })).not.toBeInTheDocument();
  });

  it('没有自定义素材时「我的」计数为 0 并展示空态', async () => {
    const user = userEvent.setup();
    vi.mocked(listPacks).mockResolvedValue(BUILTIN_ONLY);
    renderPanel();
    await packGrid();
    const familyGroup = screen.getByRole('radiogroup', { name: '素材系列' });
    const mine = within(familyGroup).getByRole('radio', { name: /^我的/ });

    expect(mine).toHaveTextContent('0');

    await user.click(mine);

    expect(screen.queryByRole('radiogroup', { name: '素材库' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('未找到匹配素材');
  });

  it('新建素材包后新素材出现在列表顶部并被激活', async () => {
    const user = userEvent.setup();
    vi.mocked(listPacks)
      .mockResolvedValueOnce(BUILTIN_ONLY)
      .mockResolvedValue([...BUILTIN_ONLY, CREATED_PACK]);

    const { onPatch } = renderPanel();
    const grid = await packGrid();
    expect(within(grid).getAllByRole('radio')).toHaveLength(BUILTIN_ONLY.length);

    await user.click(screen.getByRole('button', { name: /新建场景/ }));
    const wizard = await screen.findByRole('dialog', { name: '新建素材包' });
    await user.click(within(wizard).getByRole('button', { name: '模拟保存完成' }));

    await waitFor(() => expect(setActivePack).toHaveBeenCalledWith('my-hammer-q7z1'));
    expect(onPatch).toHaveBeenCalledWith({ activePackId: 'my-hammer-q7z1' });

    await waitFor(() => {
      const names = within(screen.getByRole('radiogroup', { name: '素材库' }))
        .getAllByRole('radio')
        .map((node) => node.querySelector('.pack-card__name')?.textContent);
      expect(names[0]).toBe('我的铁锤');
    });
  });
});

describe('MaterialPacksPanel 自定义素材编辑入口', () => {
  it('只有自定义素材卡片带编辑按钮', async () => {
    renderPanel();
    await packGrid();

    expect(screen.getByRole('button', { name: '编辑 我的锻炉' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑 我的铁砧' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑 火箭' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑 钢琴' })).not.toBeInTheDocument();
  });

  it('编辑与删除按钮并排出现在同一张卡片上', async () => {
    renderPanel();
    await packGrid();

    const edit = screen.getByRole('button', { name: '编辑 我的锻炉' });
    const del = screen.getByRole('button', { name: '删除 我的锻炉' });
    expect(edit.parentElement).toBe(del.parentElement);
    expect(edit.compareDocumentPosition(del) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('点编辑打开编辑模式向导，并把该素材包交给向导', async () => {
    const user = userEvent.setup();
    renderPanel();
    await packGrid();

    await user.click(screen.getByRole('button', { name: '编辑 我的锻炉' }));

    const wizard = await screen.findByRole('dialog', { name: '编辑素材包' });
    expect(within(wizard).getByTestId('editing-id')).toHaveTextContent('my-forge-l3k9');
  });

  it('新建入口仍打开创建模式向导（不带 editing）', async () => {
    const user = userEvent.setup();
    renderPanel();
    await packGrid();

    await user.click(screen.getByRole('button', { name: /新建场景/ }));

    const wizard = await screen.findByRole('dialog', { name: '新建素材包' });
    expect(within(wizard).queryByTestId('editing-id')).not.toBeInTheDocument();
  });

  it('编辑保存后重新拉取素材列表', async () => {
    const user = userEvent.setup();
    renderPanel();
    await packGrid();
    expect(listPacks).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: '编辑 我的锻炉' }));
    const wizard = await screen.findByRole('dialog', { name: '编辑素材包' });
    await user.click(within(wizard).getByRole('button', { name: '模拟保存完成' }));

    await waitFor(() => expect(listPacks).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog', { name: '编辑素材包' })).not.toBeInTheDocument();
  });

  it('编辑当前激活的素材包后重新激活，逼 overlay 刷新缓存', async () => {
    const user = userEvent.setup();
    renderPanel('my-forge-l3k9');
    await packGrid();

    await user.click(screen.getByRole('button', { name: '编辑 我的锻炉' }));
    const wizard = await screen.findByRole('dialog', { name: '编辑素材包' });
    await user.click(within(wizard).getByRole('button', { name: '模拟保存完成' }));

    // 同 id 内容变了，overlay 的缓存看不出来，必须再发一次 set_active_pack。
    await waitFor(() => expect(setActivePack).toHaveBeenCalledWith('my-forge-l3k9'));
  });

  it('编辑非激活素材包时不夺走当前激活状态', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderPanel('rocket');
    await packGrid();

    await user.click(screen.getByRole('button', { name: '编辑 我的锻炉' }));
    const wizard = await screen.findByRole('dialog', { name: '编辑素材包' });
    await user.click(within(wizard).getByRole('button', { name: '模拟保存完成' }));

    await waitFor(() => expect(listPacks).toHaveBeenCalledTimes(2));
    expect(setActivePack).not.toHaveBeenCalled();
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('取消编辑后再点新建，不残留上一次的编辑模式', async () => {
    const user = userEvent.setup();
    renderPanel();
    await packGrid();

    await user.click(screen.getByRole('button', { name: '编辑 我的锻炉' }));
    const wizard = await screen.findByRole('dialog', { name: '编辑素材包' });
    await user.click(within(wizard).getByRole('button', { name: '模拟关闭' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /新建场景/ }));

    const fresh = await screen.findByRole('dialog', { name: '新建素材包' });
    expect(within(fresh).queryByTestId('editing-id')).not.toBeInTheDocument();
  });
});
