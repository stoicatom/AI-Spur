import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MaterialPack } from '../shared/material-packs';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

vi.mock('../shared/ipc', () => ({
  createCustomPack: vi.fn(),
  updateCustomPack: vi.fn(),
  readLocalSoundData: vi.fn(),
}));

import { open } from '@tauri-apps/plugin-dialog';
import { createCustomPack, updateCustomPack, readLocalSoundData } from '../shared/ipc';
import { CreatePackWizard } from '../settings/components/CreatePackWizard';

const EDITING: MaterialPack = {
  id: 'my-forge-l3k9',
  name: '我的锻炉',
  builtin: false,
  imageFile: 'icon.svg',
  dataUri: 'data:image/svg+xml;base64,PHN2Zy8+',
  effect: { preset: 'impact', params: { chop: 1.9, weight: 2.1, cleave: 1.5 } },
  sound: {
    layers: [],
    sample: {
      file: 'sound.m4a',
      dataUri: 'data:audio/mp4;base64,AAAA',
      gain: 0.82,
      maxDuration: 8,
      sourceTitle: 'forge.m4a',
      sourceUrl: 'https://local.user-upload.invalid/recording',
      license: '用户自有素材',
    },
    masterGain: 0.8,
  },
  // 橙焰 hue=24，对应 ACCENT_COLORS[0]
  palette: { bodyGradient: ['#FF6B35', '#C23E00'], particleHue: 24 },
};

function renderWizard(props: Partial<Parameters<typeof CreatePackWizard>[0]> = {}) {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(<CreatePackWizard onSaved={onSaved} onClose={onClose} {...props} />);
  return { onSaved, onClose };
}

/** 走到第 N 步（向导是线性的，只能逐步下一步）。 */
async function goToStep(user: ReturnType<typeof userEvent.setup>, step: number) {
  for (let i = 0; i < step; i++) {
    await user.click(screen.getByRole('button', { name: /下一步/ }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateCustomPack).mockResolvedValue(EDITING);
  vi.mocked(createCustomPack).mockResolvedValue(EDITING);
  vi.mocked(readLocalSoundData).mockResolvedValue('data:audio/wav;base64,UklGRg==');
});

afterEach(cleanup);

describe('CreatePackWizard 编辑模式', () => {
  it('用现有素材包预填名称、预设与配色，并只读展示 id', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });

    expect(screen.getByRole('dialog', { name: '编辑素材包' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('我的锻炉');

    const idField = screen.getByText('my-forge-l3k9');
    expect(idField).toBeInTheDocument();
    // id 不可编辑：不能是输入控件
    expect(idField.tagName).not.toBe('INPUT');

    expect(screen.getByRole('radio', { name: '橙焰' })).toBeChecked();

    await goToStep(user, 2);
    expect(screen.getByRole('radio', { name: /重击/ })).toBeChecked();
  });

  it('展示当前图标与音频的「当前使用中」预览', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });

    const iconPreview = screen.getByRole('img', { name: '当前图标' });
    expect(iconPreview).toHaveAttribute('src', EDITING.dataUri);

    await goToStep(user, 1);
    expect(screen.getByLabelText('试听当前音频')).toHaveAttribute(
      'src',
      EDITING.sound.sample?.dataUri,
    );
  });

  it('不重选资产也能提交，且不传 iconPath / soundPath', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderWizard({ editing: EDITING });

    await goToStep(user, 2);
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateCustomPack).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(updateCustomPack).mock.calls[0][0];
    expect(payload.id).toBe('my-forge-l3k9');
    expect(payload.iconPath).toBeUndefined();
    expect(payload.soundPath).toBeUndefined();
    expect(onSaved).toHaveBeenCalledWith(EDITING);
  });

  it('改名后提交新名称，且不调用创建命令', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });

    const nameInput = screen.getByRole('textbox', { name: '名称' });
    await user.clear(nameInput);
    await user.type(nameInput, '改名后的锻炉');
    await goToStep(user, 2);
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateCustomPack).toHaveBeenCalled());
    expect(vi.mocked(updateCustomPack).mock.calls[0][0].name).toBe('改名后的锻炉');
    expect(createCustomPack).not.toHaveBeenCalled();
  });

  it('重选图标后提交新路径', async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue('/tmp/new-icon.png');
    renderWizard({ editing: EDITING });

    await user.click(screen.getByRole('button', { name: /更换图标/ }));
    await waitFor(() => expect(screen.getByText('new-icon.png')).toBeInTheDocument());
    await goToStep(user, 2);
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateCustomPack).toHaveBeenCalled());
    expect(vi.mocked(updateCustomPack).mock.calls[0][0].iconPath).toBe('/tmp/new-icon.png');
  });

  it('保存失败时展示错误且不回调 onSaved', async () => {
    const user = userEvent.setup();
    vi.mocked(updateCustomPack).mockRejectedValue(new Error('素材包参数无效: 未知特效预设'));
    const { onSaved } = renderWizard({ editing: EDITING });

    await goToStep(user, 2);
    await user.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByText(/未知特效预设/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe('CreatePackWizard 特效参数滑块', () => {
  it('按当前预设渲染滑块，并预填素材包里已存的参数值', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });
    await goToStep(user, 2);

    const group = screen.getByRole('group', { name: '特效参数微调' });
    expect(within(group).getByRole('slider', { name: '劈砍力' })).toHaveValue('1.9');
    expect(within(group).getByRole('slider', { name: '重量' })).toHaveValue('2.1');
    expect(within(group).getByRole('slider', { name: '裂断' })).toHaveValue('1.5');
  });

  it('拖动滑块后提交修改过的参数', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });
    await goToStep(user, 2);

    // userEvent 不支持拖动 range，用 fireEvent.change 模拟一次拖动落点。
    fireEvent.change(screen.getByRole('slider', { name: '劈砍力' }), { target: { value: '2.5' } });

    await user.click(screen.getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(updateCustomPack).toHaveBeenCalled());
    expect(vi.mocked(updateCustomPack).mock.calls[0][0].effectParams?.chop).toBe(2.5);
  });

  it('切换预设后换成新预设的滑块组', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });
    await goToStep(user, 2);

    await user.click(screen.getByRole('radio', { name: /闪电/ }));

    const group = screen.getByRole('group', { name: '特效参数微调' });
    expect(within(group).getByRole('slider', { name: '分叉数' })).toBeInTheDocument();
    expect(within(group).queryByRole('slider', { name: '劈砍力' })).not.toBeInTheDocument();
  });

  it('重置按钮把参数恢复为预设默认值', async () => {
    const user = userEvent.setup();
    renderWizard({ editing: EDITING });
    await goToStep(user, 2);

    fireEvent.change(screen.getByRole('slider', { name: '劈砍力' }), { target: { value: '2.5' } });
    expect(screen.getByRole('slider', { name: '劈砍力' })).toHaveValue('2.5');

    await user.click(screen.getByRole('button', { name: '重置为预设默认' }));

    expect(screen.getByRole('slider', { name: '劈砍力' })).toHaveValue('1.9');
  });
});

describe('CreatePackWizard 创建模式', () => {
  it('标题与按钮使用创建文案，且未选图标时不能进入下一步', async () => {
    renderWizard();

    expect(screen.getByRole('dialog', { name: '新建素材包' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下一步/ })).toBeDisabled();
  });

  it('创建模式不展示 id 字段（id 由名称派生）', () => {
    renderWizard();
    expect(screen.queryByText(/素材包 ID/)).not.toBeInTheDocument();
  });

  it('填齐名称/图标/音频后调用创建命令并带上参数', async () => {
    const user = userEvent.setup();
    vi.mocked(open)
      .mockResolvedValueOnce('/tmp/icon.svg')
      .mockResolvedValueOnce('/tmp/sound.wav');
    const { onSaved } = renderWizard();

    await user.type(screen.getByRole('textbox', { name: '名称' }), '我的铁锤');
    await user.click(screen.getByRole('button', { name: /选择 PNG/ }));
    await waitFor(() => expect(screen.getByText('icon.svg')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /下一步/ }));
    await user.click(screen.getByRole('button', { name: /选择音频文件/ }));
    await waitFor(() => expect(screen.getByText('sound.wav')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /下一步/ }));
    await user.click(screen.getByRole('button', { name: '完成创建' }));

    await waitFor(() => expect(createCustomPack).toHaveBeenCalled());
    const payload = vi.mocked(createCustomPack).mock.calls[0][0];
    expect(payload.name).toBe('我的铁锤');
    expect(payload.iconPath).toBe('/tmp/icon.svg');
    expect(payload.soundPath).toBe('/tmp/sound.wav');
    // 创建也必须带上参数 —— 否则用户建的包永远拿不到动效参数。
    expect(payload.effectParams).toBeDefined();
    expect(Object.keys(payload.effectParams ?? {}).length).toBeGreaterThan(0);
    expect(onSaved).toHaveBeenCalledWith(EDITING);
    expect(updateCustomPack).not.toHaveBeenCalled();
  });
});
