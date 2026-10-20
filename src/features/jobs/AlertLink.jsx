// /alerts/confirm?token=... and /alerts/unsubscribe?token=...: the pages the links in the alert emails open.
import { useSearchParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import SectionHeading from '../../shared/ui/SectionHeading';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { useAsync } from '../../shared/lib/useAsync';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** `kind` is "confirm" or "unsubscribe". The page tells plainly whether it worked. Never shown to search engines. */
export default function AlertLink({ kind }) {
  const { t } = useLang();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const confirm = kind === 'confirm';
  usePageMeta(confirm ? t.alertConfirmTitle : t.alertUnsubTitle, '', { noindex: true });
  const result = useAsync(() => (confirm ? api.confirmJobAlert(token) : api.unsubscribeJobAlert(token)).then((ok) => [ok]), [kind, token]);
  return (
    <div className="page">
      <SectionHeading as="h1" icon="bell" title={confirm ? t.alertConfirmTitle : t.alertUnsubTitle} />
      <AsyncView state={result}>
        {([ok]) => (
          <>
            <Notice tone={ok ? 'success' : 'error'}>{ok ? (confirm ? t.alertConfirmOk : t.alertUnsubOk) : (confirm ? t.alertConfirmBad : t.alertUnsubBad)}</Notice>
            <Button to="/jobs" tone="blue" icon="briefcase">{t.jobsTitle}</Button>
          </>
        )}
      </AsyncView>
    </div>
  );
}
