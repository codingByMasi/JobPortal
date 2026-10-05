// A pop-up box for questions ("Delete this ad?") and short forms. Esc or the Cancel button closes it.
import { useEffect, useRef } from 'react';
import Button from './Button';
import { useLang } from '../i18n/LangContext';

/** `title` is read out by screen readers. Focus moves inside, stays inside, and goes back when it closes. */
export default function Modal({ title, onClose, children, wide = false }) {
  const { t } = useLang();
  const box = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...box.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
    (focusable().find((el) => el.matches('input, select, textarea')) || focusable()[0])?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal${wide ? ' modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="modal-title">{title}</h2>
        {children}
        <div className="modal-close">
          <Button tone="outline" size="sm" onClick={onClose}>{t.cancel}</Button>
        </div>
      </div>
    </div>
  );
}
