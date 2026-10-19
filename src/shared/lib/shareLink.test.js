import { describe, expect, it } from 'vitest';
import { whatsappShareLink } from './format';

describe('whatsappShareLink', () => {
  it('opens WhatsApp with the message ready and no phone number, so the person picks the chat', () => {
    const link = whatsappShareLink('Plumber in Dubai. See the full job ad: https://example.com/job/job-1');
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe('Plumber in Dubai. See the full job ad: https://example.com/job/job-1');
  });
  it('keeps special characters (&, ?, #, spaces, Hindi) safe inside the link', () => {
    const text = 'A & B? #1 नौकरी';
    const link = whatsappShareLink(text);
    expect(link).not.toMatch(/[ #&](?=.*$)/);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe(text);
  });
});
