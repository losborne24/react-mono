import { averageColor } from './average-color.js';

describe('averageColor', () => {
  it('memoizes by URL, returning the same promise for repeat calls', () => {
    const url = 'https://i.scdn.co/image/abc';
    const first = averageColor(url);
    const second = averageColor(url);
    expect(second).toBe(first);
    // avoid unhandled rejection warnings from the never-loading jsdom image
    first.catch(() => undefined);
  });

  it('returns distinct promises for distinct URLs', () => {
    const a = averageColor('https://i.scdn.co/image/a');
    const b = averageColor('https://i.scdn.co/image/b');
    expect(a).not.toBe(b);
    a.catch(() => undefined);
    b.catch(() => undefined);
  });
});
