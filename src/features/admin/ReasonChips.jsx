// A row of ready-made reasons the admin can tap to fill the reason box (rejecting an ad or a license). The employer reads the text, so it is plain and polite.
import Button from '../../shared/ui/Button';

/** `reasons` is a list of texts; `onPick(text)` puts one in the box. */
export default function ReasonChips({ reasons, onPick, label }) {
  return (
    <div className="reason-chips" role="group" aria-label={label}>
      {reasons.map((r) => <Button key={r} size="sm" tone="outline" onClick={() => onPick(r)}>{r}</Button>)}
    </div>
  );
}
