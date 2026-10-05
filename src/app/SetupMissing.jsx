// Shown instead of the whole site when a published site has no Supabase settings (see shared/data/env.js).
import Icon from '../shared/ui/Icon';
import { useLang } from '../shared/i18n/LangContext';

/** Calm page for visitors, with one line for the owner. */
export default function SetupMissing() {
  const { t } = useLang();
  return (
    <main className="page narrow">
      <div className="state" role="alert">
        <Icon name="alert" size={56} className="state-icon warn" />
        <h1 className="state-title">{t.setupTitle}</h1>
        <p className="state-text">{t.setupVisitor}</p>
        <p className="muted">{t.setupOwner}</p>
      </div>
    </main>
  );
}
