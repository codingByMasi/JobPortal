// Turns text (for example a UPI payment link) into a QR picture, as a small SVG "data:" address that an <img> can show. No network, no raw HTML.
import qrcode from 'qrcode-generator';

/** A black-on-white QR code (with its quiet border) for `text`, or '' when the text is empty or too long to fit. */
export function qrDataUrl(text) {
  if (!text) return '';
  try {
    const qr = qrcode(0, 'M'); // type 0 = smallest size that fits
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const border = 4;
    let path = '';
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) if (qr.isDark(y, x)) path += `M${x + border} ${y + border}h1v1h-1z`;
    const size = n + border * 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}
