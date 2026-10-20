// Tests for the job-alert emails: what they say in each language, that nothing a poster typed can break them, and the sender with a fake email service.
import { describe, expect, it } from 'vitest';
import { handleRun, renderAlertEmail, sendDueAlertMail } from '../supabase/functions/_shared/alertMail.js';

const SITE = 'https://deshduniya.com';
const TOKEN = '3f1c2a9e-0d7b-4c55-9a60-1b2c3d4e5f60';
const jobs = [{ id: 'j1', title: 'Welders needed', company: 'Gulf Works', city: 'Dubai', country: 'uae' }, { id: 'j2', title: 'Cook', company: 'Hotel X', city: 'Doha', country: 'qatar' }];
const digest = (over = {}) => ({ kind: 'digest', token: TOKEN, lang: 'en', data: { total: 2, jobs }, ...over });
const confirm = (lang = 'en') => ({ kind: 'confirm', token: TOKEN, lang, data: {} });

describe('renderAlertEmail', () => {
  it('the confirm mail has a confirm button with the secret link, an unsubscribe link, and says to ignore it if unasked', () => {
    const m = renderAlertEmail(confirm(), { siteUrl: SITE });
    expect(m.subject).toBe('Please confirm your job alerts');
    expect(m.text).toContain(`${SITE}/alerts/confirm?token=${TOKEN}`);
    expect(m.text).toContain(`${SITE}/alerts/unsubscribe?token=${TOKEN}`);
    expect(m.html).toContain(`href="${SITE}/alerts/confirm?token=${TOKEN}"`);
    expect(m.html).toContain('ignore this email');
    expect(m.unsubscribeUrl).toBe(`${SITE}/alerts/unsubscribe?token=${TOKEN}`);
  });

  it('is in Hindi for a Hindi visitor and in English otherwise', () => {
    expect(renderAlertEmail(confirm('hi'), { siteUrl: SITE }).text).toMatch(/[ऀ-ॿ]/);
    expect(renderAlertEmail(confirm('en'), { siteUrl: SITE }).text).not.toMatch(/[ऀ-ॿ]/);
    expect(renderAlertEmail(confirm('xx'), { siteUrl: SITE }).subject).toBe('Please confirm your job alerts');
    expect(renderAlertEmail(digest({ lang: 'hi' }), { siteUrl: SITE }).subject).toContain('2');
  });

  it('the digest lists the ads with links, counts all of them, and keeps the unsubscribe link', () => {
    const m = renderAlertEmail(digest({ data: { total: 11, jobs } }), { siteUrl: SITE });
    expect(m.subject).toBe('11 new job ads match your alert');
    expect(m.text).toContain(`- Welders needed - Gulf Works, Dubai, UAE: ${SITE}/job/j1`);
    expect(m.text).toContain('and 9 more');
    expect(m.html).toContain('Welders needed - Gulf Works, Dubai, UAE');
    expect(m.html).toContain(`href="${SITE}/alerts/unsubscribe?token=${TOKEN}"`);
    expect(renderAlertEmail(digest({ data: { total: 1, jobs: [jobs[0]] } }), { siteUrl: SITE }).subject).toBe('1 new job ad matches your alert');
  });

  it('an unknown kind gives nothing', () => {
    expect(renderAlertEmail({ kind: 'x', token: TOKEN }, { siteUrl: SITE })).toBeNull();
  });

  it('whatever a poster typed is escaped and cut; no tags, no outside links, no header tricks in the subject', () => {
    const evil = [{ id: 'x"><b>', title: '<script>alert(1)</script>\r\nBcc: spy@example.com', company: '<img src=x onerror=1>', city: '"\'', country: 'uae' }];
    const m = renderAlertEmail(digest({ data: { total: 1, jobs: evil } }), { siteUrl: SITE });
    expect(m.subject).not.toMatch(/[\r\n<]/);
    for (const bad of ['<script', '<img', '<b>']) expect(m.html).not.toContain(bad);
    const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]);
    for (const href of hrefs) expect(href.startsWith(`${SITE}/`), href).toBe(true);
    expect(m.text).not.toMatch(/\r/);
  });

  it('missing data does not print "undefined" or "NaN"', () => {
    const m = renderAlertEmail({ kind: 'digest', token: TOKEN, lang: 'en', data: {} }, { siteUrl: SITE });
    expect(m.text + m.html).not.toMatch(/undefined|NaN|Invalid/);
  });
});

const makeDeps = (queue, { fetchFn, env = {} } = {}) => {
  const calls = [];
  const posts = [];
  const rpc = async (name, args) => { calls.push([name, args]); return { data: name === 'claim_alert_mail' ? queue : null, error: null }; };
  const okFetch = async (url, init) => { posts.push({ url, init }); return { ok: true, status: 200 }; };
  return { calls, posts, deps: { env: { RESEND_API_KEY: 're_test', NOTIFY_FROM: 'Jobs Abroad <hello@x.co>', SITE_URL: `${SITE}/`, ...env }, rpc, fetchFn: fetchFn || okFetch } };
};
const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, email: `s${i}@x.co`, ...confirm() }));

describe('sendDueAlertMail', () => {
  it('does nothing at all without an email key or a sender address', async () => {
    for (const env of [{ RESEND_API_KEY: '' }, { NOTIFY_FROM: '' }]) {
      const { deps, calls, posts } = makeDeps(rows(1), { env });
      expect(await sendDueAlertMail(deps)).toEqual({ status: 'not_configured', sent: 0, failed: 0 });
      expect(calls).toEqual([]);
      expect(posts).toEqual([]);
    }
  });

  it('sends each message with a List-Unsubscribe header and the styled page, and marks it sent', async () => {
    const { deps, calls, posts } = makeDeps(rows(2));
    expect(await sendDueAlertMail(deps)).toEqual({ status: 'ok', sent: 2, failed: 0 });
    const body = JSON.parse(posts[0].init.body);
    expect(body).toMatchObject({ to: ['s0@x.co'], headers: { 'List-Unsubscribe': `<${SITE}/alerts/unsubscribe?token=${TOKEN}>` } });
    expect(body.html).toContain('<!doctype html>');
    expect(calls.filter(([n]) => n === 'mark_alert_mail_sent').map(([, a]) => a.p_id)).toEqual(['a0', 'a1']);
  });

  it('a refusal, a network error or an unknown kind is marked failed and the rest still go out', async () => {
    let n = 0;
    const fetchFn = async () => { n += 1; if (n === 1) return { ok: false, status: 422 }; if (n === 2) throw new Error('down'); return { ok: true, status: 200 }; };
    const { deps, calls } = makeDeps([...rows(3), { id: 'bad', email: 'b@x.co', kind: 'weird', token: TOKEN, lang: 'en', data: {} }], { fetchFn });
    expect(await sendDueAlertMail(deps)).toEqual({ status: 'ok', sent: 1, failed: 3 });
    expect(calls.filter(([name]) => name === 'mark_alert_mail_failed').map(([, a]) => a.p_error)).toEqual(['email service answered 422', 'could not reach the email service', 'unknown kind weird']);
  });

  it('a queue error stops quietly', async () => {
    const deps = { env: { RESEND_API_KEY: 'k', NOTIFY_FROM: 'f' }, rpc: async () => ({ data: null, error: new Error('db down') }), fetchFn: async () => { throw new Error('must not be called'); } };
    expect(await sendDueAlertMail(deps)).toEqual({ status: 'queue_error', sent: 0, failed: 0 });
  });
});

describe('handleRun', () => {
  it('refuses a wrong secret before touching any queue, and with the right one reports both kinds of mail', async () => {
    const queue = rows(1);
    const rpc = async (name) => ({ data: name === 'claim_alert_mail' ? queue : name === 'claim_notifications' ? [] : null, error: null });
    const deps = { env: { NOTIFY_SECRET: 's3cret', RESEND_API_KEY: 'k', NOTIFY_FROM: 'f', SITE_URL: SITE }, rpc, fetchFn: async () => ({ ok: true, status: 200 }) };
    const calls = [];
    const spyRpc = async (name, args) => { calls.push(name); return rpc(name, args); };
    expect(await handleRun('wrong', { ...deps, rpc: spyRpc })).toEqual({ status: 401, body: { error: 'secret' } });
    expect(calls).toEqual([]);
    expect(await handleRun('s3cret', deps)).toEqual({ status: 200, body: { status: 'ok', sent: 0, failed: 0, alerts: { status: 'ok', sent: 1, failed: 0 } } });
  });
});
