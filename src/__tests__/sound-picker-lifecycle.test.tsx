import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../shared/config';

const mocks = vi.hoisted(() => ({
  listSoundPresets: vi.fn(),
  readSoundData: vi.fn(),
}));

vi.mock('../shared/ipc', () => ({
  listSoundPresets: mocks.listSoundPresets,
  readSoundData: mocks.readSoundData,
  setCrackSound: vi.fn(),
  uploadCustomSound: vi.fn(),
  deleteCustomSound: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import { SoundPicker } from '../settings/components/SoundPicker';

class FakeAudio {
  static instances: FakeAudio[] = [];
  volume = 1;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly play = vi.fn(() => Promise.resolve());
  readonly pause = vi.fn();
  readonly removeAttribute = vi.fn();
  readonly load = vi.fn();

  constructor(readonly src: string) { FakeAudio.instances.push(this); }
}

describe('SoundPicker preview lifecycle', () => {
  beforeEach(() => {
    FakeAudio.instances.length = 0;
    mocks.listSoundPresets.mockResolvedValue([
      { id: 'one', name: '一号', isBuiltin: true, files: ['one.wav'] },
      { id: 'two', name: '二号', isBuiltin: true, files: ['two.wav'] },
    ]);
    mocks.readSoundData.mockResolvedValue('data:audio/wav;base64,AAAA');
    vi.stubGlobal('Audio', FakeAudio);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('releases the previous preview and the current preview on unmount', async () => {
    const view = render(<SoundPicker config={DEFAULT_CONFIG} onPatch={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '试听 一号' }));
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
    const first = FakeAudio.instances[0];

    fireEvent.click(screen.getByRole('button', { name: '试听 二号' }));
    await waitFor(() => expect(FakeAudio.instances).toHaveLength(2));
    expect(first.pause).toHaveBeenCalledTimes(1);
    expect(first.removeAttribute).toHaveBeenCalledWith('src');
    expect(first.load).toHaveBeenCalledTimes(1);

    const second = FakeAudio.instances[1];
    view.unmount();
    expect(second.pause).toHaveBeenCalledTimes(1);
    expect(second.removeAttribute).toHaveBeenCalledWith('src');
    expect(second.load).toHaveBeenCalledTimes(1);
  });

  it('does not create an Audio element when data arrives after unmount', async () => {
    let resolve!: (uri: string) => void;
    mocks.readSoundData.mockReturnValue(new Promise<string>((done) => { resolve = done; }));
    const view = render(<SoundPicker config={DEFAULT_CONFIG} onPatch={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: '试听 一号' }));
    await waitFor(() => expect(mocks.readSoundData).toHaveBeenCalledTimes(1));
    view.unmount();

    await act(async () => { resolve('data:audio/wav;base64,LATE'); });
    expect(FakeAudio.instances).toHaveLength(0);
  });
});
