// A labelled form box: big label, optional help line, optional error line.
import { cloneElement, useId } from 'react';

/** Wrap one input / select / textarea. The label, help and error are linked to it for screen readers. */
export default function Field({ label, help, error, children }) {
  const id = useId();
  const describedBy = [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {help && <p className="field-help" id={`${id}-help`}>{help}</p>}
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? 'true' : undefined })}
      {error && <p className="field-error" id={`${id}-error`} role="alert">{error}</p>}
    </div>
  );
}
