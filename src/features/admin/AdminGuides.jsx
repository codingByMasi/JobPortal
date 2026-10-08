// /admin/guides - the guides for admins, employers and job seekers, readable by admins only. Each can be copied to send on WhatsApp.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Markdown from '../../shared/ui/Markdown';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';

/** One guide, shown with a Copy button. */
function GuideView({ slug }) {
  const { t, lang } = useLang();
  const guide = useAsync(() => api.adminGetGuide(slug), [slug]);
  const [copied, setCopied] = useState(null);
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <AsyncView state={guide} isEmpty={(g) => !g} empty={t.guideMissing} emptyIcon="file">
      {(g) => (
        <article className="guide">
          <div className="actions no-print">
            <Button icon="copy" tone="outline" onClick={() => copy(g.body)}>{copied ? t.guideCopied : t.guideCopy}</Button>
            <Button icon="download" tone="outline" onClick={() => window.print()}>{t.receiptPrint}</Button>
          </div>
          {copied === false && <Notice tone="error">{t.payCopyFailed}</Notice>}
          {g.updatedAt && <p className="muted">{t.guideUpdated(formatDate(g.updatedAt, lang))}</p>}
          <Markdown source={g.body} />
        </article>
      )}
    </AsyncView>
  );
}

/** The guides list and the chosen guide. */
export default function AdminGuides() {
  const { t } = useLang();
  const [params, setParams] = useSearchParams();
  const list = useAsync(() => api.adminListGuides(), []);
  const chosen = params.get('g') || '';
  return (
    <section className="section">
      <p className="help">{t.guidesHelp}</p>
      <AsyncView state={list} empty={t.guidesNone} emptyIcon="file">
        {(guides) => (
          <>
            <div className="chips" role="group" aria-label={t.tabGuides}>
              {guides.map((g) => (
                <button key={g.slug} type="button" className="chip" aria-pressed={(chosen || guides[0].slug) === g.slug} onClick={() => setParams({ g: g.slug }, { replace: true })}>{g.title}</button>
              ))}
            </div>
            <GuideView slug={chosen && guides.some((g) => g.slug === chosen) ? chosen : guides[0].slug} />
          </>
        )}
      </AsyncView>
    </section>
  );
}
