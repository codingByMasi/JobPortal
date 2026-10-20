// Tests for when the install bar may be shown again.
import { describe, expect, it } from 'vitest';
import { mayAskToInstall } from './installPrompt';

const DAY = 24 * 60 * 60 * 1000;
describe('mayAskToInstall', () => {
  it('asks when nothing was saved or the saved value is not a time', () => {
    expect(mayAskToInstall(null, 1000)).toBe(true);
    expect(mayAskToInstall('abc', 1000)).toBe(true);
    expect(mayAskToInstall('0', 1000)).toBe(true);
  });
  it('stays quiet for 30 days after "Not now", then asks again', () => {
    const now = 100 * DAY;
    expect(mayAskToInstall(String(now - 1 * DAY), now)).toBe(false);
    expect(mayAskToInstall(String(now - 29 * DAY), now)).toBe(false);
    expect(mayAskToInstall(String(now - 30 * DAY), now)).toBe(true);
  });
});
