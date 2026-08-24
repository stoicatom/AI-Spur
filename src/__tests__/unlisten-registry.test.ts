import { describe, expect, it, vi } from 'vitest';
import { UnlistenRegistry } from '../overlay/unlisten-registry';

describe('UnlistenRegistry', () => {
  it('releases active subscriptions once on dispose', async () => {
    const unlisten = vi.fn();
    const registry = new UnlistenRegistry();
    registry.track(Promise.resolve(unlisten), 'ready');
    await Promise.resolve();

    registry.dispose();
    registry.dispose();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('immediately releases a subscription that resolves after dispose', async () => {
    let resolve!: (unlisten: () => void) => void;
    const pending = new Promise<() => void>((done) => { resolve = done; });
    const unlisten = vi.fn();
    const registry = new UnlistenRegistry();
    registry.track(pending, 'late');

    registry.dispose();
    resolve(unlisten);
    await Promise.resolve();

    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
