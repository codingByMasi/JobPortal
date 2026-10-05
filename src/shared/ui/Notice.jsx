// A short message box. `tone` is "success", "error" or "info". Errors are announced at once to screen readers.
import Icon from './Icon';

export default function Notice({ tone = 'info', children }) {
  if (!children) return null;
  return (
    <p className={`msg msg-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'error' ? 'alert' : 'check'} size={22} />
      <span>{children}</span>
    </p>
  );
}
