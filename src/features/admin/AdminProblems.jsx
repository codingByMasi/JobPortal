// /admin/problems - crashes reported by the website (newest first), so a broken screen is noticed without waiting for a complaint.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { formatSize } from '../../shared/lib/unusedFiles';
import { useLang } from '../../shared/i18n/LangContext';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';

/** Looks for picture files that no ad uses any more and removes them when the admin agrees. */
function UnusedFiles() {
  const { t } = useLang();
  const { notice, success, fail } = useNotice();
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);

  const look = async () => {
    setBusy(true);
    try {
      setFound(await api.adminListUnusedFiles());
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const n = await api.adminRemoveFiles(found.map((f) => f.path));
      success(t.unusedRemoved(n));
      setFound(null);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const bytes = (found || []).reduce((sum, f) => sum + (f.size || 0), 0);
  return (
    <section className="section">
      <h2 className="section-title">{t.unusedTitle}</h2>
      <p className="help">{t.unusedHelp}</p>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <div className="actions">
        <Button tone="outline" icon="search" onClick={look} disabled={busy}>{busy ? t.loading : t.unusedLook}</Button>
        {found && found.length > 0 && <Button tone="danger" icon="trash" onClick={remove} disabled={busy}>{t.unusedDelete(found.length, formatSize(bytes))}</Button>}
      </div>
      {found && found.length === 0 && <Notice tone="success">{t.unusedNone}</Notice>}
    </section>
  );
}

/** Problems list for the admin. */
export default function AdminProblems() {
  const { t, lang } = useLang();
  const list = useAsync(() => api.adminListErrors(), []);
  const { notice, success, fail } = useNotice();

  const clear = async () => {
    try {
      await api.adminClearErrors();
      success(t.problemsCleared);
      list.reload();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <>
    <section className="section">
      <p className="help">{t.problemsHelp}</p>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={list} empty={t.problemsNone} emptyIcon="check">
        {(rows) => (
          <>
            <div className="toolbar"><Button tone="outline" icon="trash" onClick={clear}>{t.problemsClear}</Button></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>{t.colDate}</th><th>{t.problemsPage}</th><th>{t.problemsWhat}</th><th>{t.problemsTimes}</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label={t.colDate}>{formatDate(r.lastAt, lang)}</td>
                      <td data-label={t.problemsPage}>{r.page || '-'}</td>
                      <td data-label={t.problemsWhat}>{r.message}</td>
                      <td data-label={t.problemsTimes}>{r.times}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncView>
    </section>
    <UnusedFiles />
    </>
  );
}
