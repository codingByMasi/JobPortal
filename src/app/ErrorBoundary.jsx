// Catches any unexpected screen error so people see a calm message and a reload button, not a blank page.
import { Component } from 'react';
import Button from '../shared/ui/Button';
import Icon from '../shared/ui/Icon';
import { useLang } from '../shared/i18n/LangContext';

/** Friendly "something went wrong" screen. */
function Fallback() {
  const { t } = useLang();
  return (
    <div className="page">
      <div className="state" role="alert">
        <Icon name="alert" size={56} className="state-icon warn" />
        <h1 className="state-title">{t.crashTitle}</h1>
        <p className="state-text">{t.crashText}</p>
        <Button tone="blue" icon="refresh" onClick={() => window.location.assign('/')}>{t.retry}</Button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error('Screen crashed:', error);
  }

  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}
