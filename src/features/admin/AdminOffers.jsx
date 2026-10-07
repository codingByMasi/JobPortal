// /admin/offers - discounts, coupon codes and bonus days: create, switch on or off, copy, see who used them.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminOfferForm from './AdminOfferForm';
import AdminRedemptions from './AdminRedemptions';
import Button from '../../shared/ui/Button';
import Notice from '../../shared/ui/Notice';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { offerStatus } from '../../shared/lib/pricing';
import { useAsync } from '../../shared/lib/useAsync';
import { useNotice } from '../../shared/lib/useNotice';

/** Offers list for the admin. `?employer=<id>` opens a new offer made for that employer. */
export default function AdminOffers() {
  const { t, lang } = useLang();
  const [params, setParams] = useSearchParams();
  const data = useAsync(async () => {
    const [offers, packages, employers] = await Promise.all([api.adminListOffers(), api.listPackages(), api.adminListRecruiters()]);
    return { offers, packages, employers };
  }, []);
  const { notice, success, fail } = useNotice();
  const forEmployer = params.get('employer');
  const [editing, setEditing] = useState(forEmployer ? { appliesTo: 'recruiter', recruiterId: forEmployer } : null); // null = closed
  const [viewing, setViewing] = useState(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setEditing(null);
    if (forEmployer) setParams({}, { replace: true });
  };

  const toggle = async (offer) => {
    setBusy(true);
    try {
      await api.adminSetOfferActive(offer.id, !offer.active);
      success(t.offerSaved);
      data.reload();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const target = (o, d) => {
    if (o.appliesTo === 'package') return d.packages.find((p) => p.id === o.packageId)?.name || '-';
    if (o.appliesTo === 'recruiter') return o.recruiterName || d.employers.find((e) => e.id === o.recruiterId)?.companyName || '-';
    return t.offerAll;
  };
  const amount = (o) => ({ percent: `${o.value}%`, flat: formatPrice(o.value), bonus_days: t.pkgDays(o.value), free: t.offerTypeFree }[o.type]);

  return (
    <section className="section">
      <div className="toolbar">
        <Button icon="plus" onClick={() => setEditing({})}>{t.addOffer}</Button>
      </div>
      <p className="help">{t.offersHelp}</p>
      <Notice tone={notice.tone}>{notice.text}</Notice>
      <AsyncView state={data} isEmpty={(d) => d.offers.length === 0} empty={t.noOffers} emptyIcon="badge">
        {(d) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t.offerName}</th><th>{t.offerGives}</th><th>{t.offerFor}</th><th>{t.offerCoupon}</th><th>{t.offerDates}</th><th>{t.offerUsesCol}</th><th>{t.colStatus}</th><th>{t.colActions}</th></tr>
              </thead>
              <tbody>
                {d.offers.map((o) => {
                  const status = offerStatus(o, o.uses);
                  return (
                    <tr key={o.id} className={o.active ? '' : 'row-off'}>
                      <td data-label={t.offerName}><strong>{o.name}</strong></td>
                      <td data-label={t.offerGives}>{amount(o)}</td>
                      <td data-label={t.offerFor}>{target(o, d)}</td>
                      <td data-label={t.offerCoupon}>{o.couponCode || t.offerAutomatic}</td>
                      <td data-label={t.offerDates}>{o.startsAt ? formatDate(o.startsAt, lang) : '-'} → {o.endsAt ? formatDate(o.endsAt, lang) : '-'}</td>
                      <td data-label={t.offerUsesCol}>{o.maxUses ? `${o.uses} / ${o.maxUses}` : o.uses}</td>
                      <td data-label={t.colStatus}>{t.offerStatus[status]}</td>
                      <td data-label={t.colActions}>
                        <div className="row-actions">
                          <Button size="sm" tone="outline" icon="edit" onClick={() => setEditing(o)}>{t.edit}</Button>
                          <Button size="sm" tone={o.active ? 'outline' : 'green'} icon={o.active ? 'eyeoff' : 'eye'} disabled={busy} onClick={() => toggle(o)}>{o.active ? t.offerTurnOff : t.offerTurnOn}</Button>
                          <Button size="sm" tone="outline" icon="copy" onClick={() => setEditing({ ...o, id: undefined, name: t.offerCopyName(o.name), couponCode: '', active: false })}>{t.duplicate}</Button>
                          <Button size="sm" tone="outline" icon="list" onClick={() => setViewing(o)}>{t.offerUsesCol}</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>
      {editing && data.data && (
        <AdminOfferForm
          offer={editing}
          packages={data.data.packages}
          employers={data.data.employers}
          onClose={close}
          onSaved={() => {
            close();
            success(t.offerSaved);
            data.reload();
          }}
        />
      )}
      {viewing && <AdminRedemptions offer={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}
