// Who used one offer, when, and how much it gave away (a pop-up on the Offers screen).
import Modal from '../../shared/ui/Modal';
import { AsyncView } from '../../shared/ui/StateViews';
import { api } from '../../shared/data';
import { formatDate } from '../../shared/lib/format';
import { useLang } from '../../shared/i18n/LangContext';
import { formatPrice } from '../../shared/lib/money';
import { useAsync } from '../../shared/lib/useAsync';

/** The uses of `offer`. */
export default function AdminRedemptions({ offer, onClose }) {
  const { t, lang } = useLang();
  const rows = useAsync(() => api.adminListRedemptions(offer.id), [offer.id]);
  return (
    <Modal title={t.offerUsesTitle(offer.name)} onClose={onClose} wide>
      <AsyncView state={rows} empty={t.noRedemptions} emptyIcon="card">
        {(list) => (
          <ul className="mini-list">
            {list.map((r) => (
              <li key={r.id}>
                <span>{formatDate(r.createdAt, lang)} · {r.recruiterName || '-'} · {r.jobTitle || '-'}</span>
                <span>{r.bonusDays ? t.pkgDays(r.bonusDays) : formatPrice(r.discountPaise)}</span>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
    </Modal>
  );
}
