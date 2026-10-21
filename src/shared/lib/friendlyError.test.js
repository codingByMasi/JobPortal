import { describe, expect, it } from 'vitest';
import { translations } from '../i18n';
import { errorKey, friendlyMessage } from './friendlyError';

describe('friendly errors', () => {
  it('maps our own codes', () => {
    expect(errorKey({ code: 'LOGIN' })).toBe('errLogin');
    expect(errorKey({ code: 'PDF_BIG' })).toBe('errPdfBig');
    expect(errorKey({ code: 'BLOCKED' })).toBe('errBlocked');
  });
  it('understands known Supabase and browser messages', () => {
    expect(errorKey({ message: 'Invalid login credentials' })).toBe('errLogin');
    expect(errorKey({ message: 'User already registered' })).toBe('errEmailTaken');
    expect(errorKey({ message: 'Password should be at least 6 characters' })).toBe('errWeakPassword');
    expect(errorKey({ message: 'Email not confirmed' })).toBe('errEmailNotConfirmed');
    expect(errorKey({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe('errAlreadyApplied');
    expect(errorKey({ code: '53400', message: 'Too many unpaid ads.' })).toBe('errTooManyAds');
    expect(errorKey({ code: '54000', message: 'This ad cannot take more applications.' })).toBe('errTooManyApplications');
    expect(errorKey({ message: 'Failed to fetch' })).toBe('errNetwork');
    expect(errorKey({ code: '42501', message: 'new row violates row-level security policy' })).toBe('errNotAllowed');
    expect(errorKey({ message: 'This ad is not waiting for payment.' })).toBe('errNotWaiting');
  });
  it('understands the human check and job alert errors in plain words', () => {
    expect(errorKey({ code: 'HUMAN' })).toBe('errHumanCheck');
    expect(errorKey({ code: '22023', message: 'Please finish the human check and try again.' })).toBe('errHumanCheck');
    expect(errorKey({ code: '22023', message: 'Please write a correct email address.' })).toBe('errAlertEmail');
    expect(errorKey({ code: '54000', message: 'This email already has 5 alerts.' })).toBe('errAlertLimit');
    expect(errorKey({ code: '54000', message: 'Too many requests right now. Please try again later.' })).toBe('errAlertBusy');
    for (const lang of ['en', 'hi']) for (const key of ['errHumanCheck', 'errAlertEmail', 'errAlertLimit', 'errAlertBusy']) expect(translations[lang][key]).toBeTruthy();
  });
  it('understands the license and verification errors', () => {
    expect(errorKey({ code: 'P0001', message: 'Your account is not verified yet.' })).toBe('errNeedVerified');
    expect(errorKey({ code: 'NOT_VERIFIED' })).toBe('errNeedVerified');
    expect(errorKey({ code: 'P0001', message: 'license: needed' })).toBe('errLicenseNeeded');
    expect(errorKey({ code: '22023', message: 'license: number' })).toBe('errLicenseNumber');
    expect(errorKey({ code: '22023', message: 'license: file' })).toBe('errLicenseFile');
    for (const lang of ['en', 'hi']) for (const key of ['errNeedVerified', 'errLicenseNeeded', 'errLicenseNumber', 'errLicenseFile']) expect(translations[lang][key]).toBeTruthy();
  });
  it('never shows technical words: unknown errors become the generic sentence', () => {
    expect(errorKey(new Error('PGRST999 something internal'))).toBe('errGeneric');
    expect(errorKey(undefined)).toBe('errGeneric');
  });
  it('every key it can return exists in both languages', () => {
    const codes = ['LOGIN', 'EMAIL_TAKEN', 'WEAK_PASSWORD', 'NETWORK', 'BLOCKED', 'NOT_ALLOWED', 'NEED_LOGIN', 'NOT_FOUND', 'FILE_TYPE',
      'PDF_BIG', 'EMAIL_NOT_CONFIRMED', 'DUPLICATE', 'LIMIT', 'TOO_MANY_ADS', 'IMAGE_FAIL', 'STORAGE_FULL', 'ENDED', 'NOT_WAITING', 'BAD_PRICE', 'UPLOAD', 'NOPE'];
    for (const lang of ['en', 'hi']) {
      for (const code of codes) expect(friendlyMessage({ code }, translations[lang])).toBeTruthy();
    }
  });
});
