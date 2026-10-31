// Tests for the employer emails: what they say, that nothing an employer typed can break them, and the sender loop with a fake email service.
import { describe, expect, it } from 'vitest';
import { handleSend, renderEmail, sameSecret, sendDueNotifications } from '../supabase/functions/_shared/notify.js';

const SITE = 'https://deshduniya.com';
const KINDS = ['license_verified', 'license_rejected', 'ad_approved', 'ad_rejected', 'ad_extended', 'ad_ending_soon', 'ad_ended'];
const data = { job_id: 'abc-123', title: 'Welders needed', days: 20, ends: '2026-11-10T10:00:00Z', reason: 'The picture is not clear.' };

describe('renderEmail', () => {
  it('writes every kind in English and then Hindi, with the site link and how to turn the emails off', () => {
    for (const kind of KINDS) {
      const mail = renderEmail(kind, data, { siteUrl: SITE });
      expect(mail.subject.length, kind).toBeGreaterThan(5);
      expect(mail.text, kind).toContain(SITE);
      expect(mail.text, kind).toMatch(/[ऀ-ॿ]/); // Hindi is there
      expect(mail.text, kind).toContain('turn them off');
    }
  });

  it('puts the facts in the right messages', () => {
    expect(renderEmail('ad_approved', data, { siteUrl: SITE }).text).toContain('"Welders needed" is now live on Jobs Abroad for 20 days (until 10 Nov 2026)');
    expect(renderEmail('ad_approved', data, { siteUrl: SITE }).text).toContain(`${SITE}/job/abc-123`);
    expect(renderEmail('ad_rejected', data, { siteUrl: SITE }).text).toContain('Reason: The picture is not clear.');
    expect(renderEmail('license_rejected', data, { siteUrl: SITE }).text).toContain('Reason: The picture is not clear.');
    expect(renderEmail('ad_extended', data, { siteUrl: SITE }).text).toContain('We added 20 days');
    expect(renderEmail('ad_ending_soon', data, { siteUrl: SITE }).text).toContain('ends on 10 Nov 2026');
    expect(renderEmail('ad_ended', data, { siteUrl: SITE }).text).toContain('has ended');
    expect(renderEmail('license_verified', {}, { siteUrl: SITE }).subject).toBe('Your job posting request is approved on Jobs Abroad');
  });

  it('an unknown kind gives nothing', () => {
    expect(renderEmail('something_else', data, { siteUrl: SITE })).toBeNull();
  });

  it('a title with line breaks or fake headers cannot change the subject; the text stays plain', () => {
    const evil = { ...data, title: 'Hello\r\nBcc: spy@example.com\nSubject: Win money <script>alert(1)</script>' };
    const mail = renderEmail('ad_approved', evil, { siteUrl: SITE });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject.length).toBeLessThanOrEqual(120);
    expect(mail.text).not.toMatch(/\r/);
  });

  it('the styled page has a header, both languages with a button each, and a footer', () => {
    for (const kind of KINDS) {
      const { html } = renderEmail(kind, data, { siteUrl: SITE });
      expect(html, kind).toContain('Jobs Abroad</span>'); // header bar
      expect(html, kind).toContain('lang="en"');
      expect(html, kind).toContain('lang="hi"');
      expect(html.match(/<a href="/g).length, kind).toBe(4); // two buttons and two footer links
      expect(html, kind).toContain('turn them off'); // footer
      expect(html, kind).toMatch(/[ऀ-ॿ]/);
    }
  });

  it('whatever an employer typed is escaped in the page: no tags, no quotes that break out, no outside links', () => {
    const evil = { ...data, title: '<script>alert(1)</script><img src=x onerror=alert(2)>"\'', reason: '<a href="https://evil.example">click</a>', job_id: 'x"><b>' };
    for (const kind of KINDS) {
      const { html } = renderEmail(kind, evil, { siteUrl: SITE });
      expect(html, kind).not.toContain('<script');
      expect(html, kind).not.toContain('<img');
      expect(html, kind).not.toContain('<b>');
      expect(html, kind).not.toContain('href="https://evil.example"');
      const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
      for (const href of hrefs) expect(href.startsWith(`${SITE}/`), `${kind} ${href}`).toBe(true);
    }
  });

  it('a site address that is not https gives no links at all', () => {
    const { html } = renderEmail('ad_approved', data, { siteUrl: 'http://deshduniya.com' });
    expect(html).not.toContain('<a href=');
  });

  it('long reasons and titles are cut, a missing date does not print "undefined" or "Invalid Date"', () => {
    const mail = renderEmail('ad_rejected', { title: 'T'.repeat(500), reason: 'R'.repeat(900) }, { siteUrl: SITE });
    expect(mail.text.length).toBeLessThan(2000);
    for (const kind of KINDS) expect(renderEmail(kind, {}, { siteUrl: SITE }).text, kind).not.toMatch(/undefined|Invalid Date|NaN/);
  });
});

const rows = (n, over = {}) => Array.from({ length: n }, (_, i) => ({ id: `n${i}`, kind: 'ad_approved', data, email: `e${i}@x.co`, ...over }));
const makeDeps = (queue, { fetchFn, env = {} } = {}) => {
  const calls = [];
  const sent = [];
  const rpc = async (name, args) => {
    calls.push([name, args]);
    return { data: name === 'claim_notifications' ? queue : null, error: null };
  };
  const posts = [];
  const okFetch = async (url, init) => { posts.push({ url, init }); return { ok: true, status: 200 }; };
  return { calls, sent, posts, deps: { env: { RESEND_API_KEY: 're_test', NOTIFY_FROM: 'Jobs Abroad <hello@deshduniya.com>', SITE_URL: `${SITE}/`, ...env }, rpc, fetchFn: fetchFn || okFetch } };
};

describe('sendDueNotifications', () => {
  it('does nothing at all without an email key or a sender address: the queue is not even touched', async () => {
    for (const env of [{ RESEND_API_KEY: '' }, { NOTIFY_FROM: '' }]) {
      const { deps, calls, posts } = makeDeps(rows(2), { env });
      expect(await sendDueNotifications(deps)).toEqual({ status: 'not_configured', sent: 0, failed: 0 });
      expect(calls).toEqual([]);
      expect(posts).toEqual([]);
    }
  });

  it('sends one plain-text email per message, with the key as a Bearer login, and marks each as sent', async () => {
    const { deps, calls, posts } = makeDeps(rows(2));
    expect(await sendDueNotifications(deps)).toEqual({ status: 'ok', sent: 2, failed: 0 });
    expect(posts.length).toBe(2);
    expect(posts[0].url).toBe('https://api.resend.com/emails');
    expect(posts[0].init.headers.Authorization).toBe('Bearer re_test');
    const body = JSON.parse(posts[0].init.body);
    expect(body).toMatchObject({ from: 'Jobs Abroad <hello@deshduniya.com>', to: ['e0@x.co'] });
    expect(body.text).toContain(`${SITE}/job/abc-123`); // the trailing slash of SITE_URL was dropped
    expect(body.html).toContain('<!doctype html>'); // the styled page goes with the plain-text copy
    expect(body.html).toContain(`${SITE}/job/abc-123`);
    expect(calls.filter(([n]) => n === 'mark_notification_sent').map(([, a]) => a.p_id)).toEqual(['n0', 'n1']);
  });

  it('a refusal or an unreachable service marks the message as failed (so it is tried again later) and the rest still go out', async () => {
    let n = 0;
    const fetchFn = async () => {
      n += 1;
      if (n === 1) return { ok: false, status: 422 };
      if (n === 2) throw new Error('network down');
      return { ok: true, status: 200 };
    };
    const { deps, calls } = makeDeps(rows(3), { fetchFn });
    expect(await sendDueNotifications(deps)).toEqual({ status: 'ok', sent: 1, failed: 2 });
    const failed = calls.filter(([name]) => name === 'mark_notification_failed');
    expect(failed.map(([, a]) => a.p_error)).toEqual(['email service answered 422', 'could not reach the email service']);
    expect(calls.filter(([name]) => name === 'mark_notification_sent').length).toBe(1);
  });

  it('an unknown kind or a missing address is marked failed without calling the email service', async () => {
    const { deps, calls, posts } = makeDeps([{ id: 'a', kind: 'weird', data, email: 'a@x.co' }, { id: 'b', kind: 'ad_ended', data, email: '' }]);
    expect(await sendDueNotifications(deps)).toEqual({ status: 'ok', sent: 0, failed: 2 });
    expect(posts).toEqual([]);
    expect(calls.filter(([name]) => name === 'mark_notification_failed').map(([, a]) => a.p_error)).toEqual(['unknown kind weird', 'no email address']);
  });

  it('a queue error stops quietly', async () => {
    const deps = { env: { RESEND_API_KEY: 'k', NOTIFY_FROM: 'f' }, rpc: async () => ({ data: null, error: new Error('db down') }), fetchFn: async () => { throw new Error('must not be called'); } };
    expect(await sendDueNotifications(deps)).toEqual({ status: 'queue_error', sent: 0, failed: 0 });
  });
});

describe('the web call', () => {
  it('compares the secret exactly; an empty or missing secret never works', () => {
    expect(sameSecret('abc', 'abc')).toBe(true);
    expect(sameSecret('abd', 'abc')).toBe(false);
    expect(sameSecret('abcd', 'abc')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret(null, 'abc')).toBe(false);
    expect(sameSecret('abc', undefined)).toBe(false);
  });

  it('refuses a wrong secret before touching the queue, and sends with the right one', async () => {
    const { deps, calls } = makeDeps(rows(1), { env: { NOTIFY_SECRET: 's3cret' } });
    expect(await handleSend('wrong', deps)).toEqual({ status: 401, body: { error: 'secret' } });
    expect(await handleSend(null, deps)).toEqual({ status: 401, body: { error: 'secret' } });
    expect(calls).toEqual([]);
    expect(await handleSend('s3cret', deps)).toEqual({ status: 200, body: { status: 'ok', sent: 1, failed: 0 } });
    const noSecret = makeDeps(rows(1));
    expect((await handleSend('anything', noSecret.deps)).status).toBe(401); // no secret configured: always refused
  });
});
