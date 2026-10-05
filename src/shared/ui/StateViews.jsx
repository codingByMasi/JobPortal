// The non-happy states for any screen: loading, empty, error (with Retry) - and AsyncView that picks the right one.
import Button from './Button';
import Icon from './Icon';
import { useLang } from '../i18n/LangContext';

/** Spinner + short message while data loads. */
export function Loading() {
  const { t } = useLang();
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="state-text">{t.loading}</p>
    </div>
  );
}

/** Shown when no ad matches. `onClear` adds a "clear filters" button. `text` replaces the default words. */
export function Empty({ onClear, text, icon = 'search', children }) {
  const { t } = useLang();
  return (
    <div className="state">
      <Icon name={icon} size={56} className="state-icon" />
      {!text && <h3 className="state-title">{t.emptyTitle}</h3>}
      <p className="state-text">{text || t.emptyText}</p>
      {onClear && <Button tone="outline" icon="close" onClick={onClear}>{t.clearFilters}</Button>}
      {children}
    </div>
  );
}

/** Shown when something could not be loaded. */
export function ErrorState({ onRetry }) {
  const { t } = useLang();
  return (
    <div className="state" role="alert">
      <Icon name="alert" size={56} className="state-icon warn" />
      <h3 className="state-title">{t.errorTitle}</h3>
      <p className="state-text">{t.errorText}</p>
      <Button tone="blue" icon="refresh" onClick={onRetry}>{t.retry}</Button>
    </div>
  );
}

/** Picks Loading / ErrorState from the shared jobs state, or returns null when jobs are ready. */
export function JobsStatus({ status, onRetry }) {
  if (status === 'loading') return <Loading />;
  if (status === 'error') return <ErrorState onRetry={onRetry} />;
  return null;
}

/**
 * Shows loading / error / empty / content for a useAsync() result.
 * `children` is a function that gets the data. `empty` is the text for "nothing here".
 */
export function AsyncView({ state, isEmpty, empty, emptyIcon, emptyAction, children }) {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error') return <ErrorState onRetry={state.reload} />;
  if (isEmpty ? isEmpty(state.data) : !state.data?.length) return <Empty text={empty} icon={emptyIcon}>{emptyAction}</Empty>;
  return children(state.data);
}
