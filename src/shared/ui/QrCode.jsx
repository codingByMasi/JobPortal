// A QR code picture for some text. `label` is the picture's spoken description. Shows nothing if the code cannot be made.
import { qrDataUrl } from '../lib/qrImage';

/** QR code for `value`, shown at `size` pixels square. */
export default function QrCode({ value, label, size = 200 }) {
  const src = qrDataUrl(value);
  if (!src) return null;
  return <img className="qr" src={src} alt={label} width={size} height={size} />;
}
