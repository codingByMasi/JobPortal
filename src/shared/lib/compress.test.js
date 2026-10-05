import { describe, expect, it } from 'vitest';
import { fileKind, fitSize, LIMITS, prepareFile } from './compress';

const file = (name, type, size = 10) => ({ name, type, size });

describe('fitSize', () => {
  it('leaves small pictures alone', () => expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 }));
  it('never goes wider than 1200 and keeps the shape', () => {
    expect(fitSize(2400, 1200)).toEqual({ width: 1200, height: 600 });
    expect(fitSize(4000, 3000)).toEqual({ width: 1200, height: 900 });
  });
  it('never makes a zero-height picture', () => expect(fitSize(100000, 1).height).toBe(1));
});

describe('fileKind', () => {
  it('allows only JPG, PNG, WebP and PDF', () => {
    expect(fileKind(file('a.jpg', 'image/jpeg'))).toBe('image');
    expect(fileKind(file('a.png', 'image/png'))).toBe('image');
    expect(fileKind(file('a.webp', 'image/webp'))).toBe('image');
    expect(fileKind(file('a.pdf', 'application/pdf'))).toBe('pdf');
  });
  it('refuses everything else, even with a nice-looking name', () => {
    for (const f of [file('a.svg', 'image/svg+xml'), file('a.gif', 'image/gif'), file('a.exe', 'application/x-msdownload'),
      file('a.html', 'text/html'), file('photo.jpg.exe', 'application/octet-stream'), file('x.js', 'text/javascript')]) {
      expect(fileKind(f)).toBeNull();
    }
  });
  it('uses the ending when the browser gives no type', () => {
    expect(fileKind(file('scan.PDF', ''))).toBe('pdf');
    expect(fileKind(file('pic.JPEG', ''))).toBe('image');
    expect(fileKind(file('pic.svg', ''))).toBeNull();
  });
});

describe('prepareFile', () => {
  it('refuses a wrong file type', async () => {
    await expect(prepareFile(file('a.svg', 'image/svg+xml'))).rejects.toMatchObject({ code: 'FILE_TYPE' });
  });
  it('refuses a PDF over 2 MB but takes one just under', async () => {
    await expect(prepareFile(file('a.pdf', 'application/pdf', LIMITS.pdfMaxBytes + 1))).rejects.toMatchObject({ code: 'PDF_BIG' });
    const ok = file('a.pdf', 'application/pdf', LIMITS.pdfMaxBytes);
    await expect(prepareFile(ok)).resolves.toEqual({ file: ok, fileType: 'pdf' });
  });
});
