// About, FAQ and Refund policy: plain headed text from the language files. The words are drafts for a professional to review.
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';
import { useSettings } from '../../shared/settings/SettingsContext';

/** `kind` is "about", "faq" or "refund". */
export default function InfoPage({ kind }) {
  const { t } = useLang();
  const { settings, has } = useSettings();
  const page = {
    about: { title: t.aboutTitle, meta: t.metaAbout, icon: 'home', items: t.aboutSections.map((s, i) => ({ h: s.h, p: i === t.aboutSections.length - 1 && has('companyName') ? t.aboutWho(settings.companyName) : s.p })) },
    faq: { title: t.faqTitle, meta: t.metaFaq, icon: 'search', items: t.faqItems.map((s) => ({ h: s.q, p: s.a })) },
    refund: { title: t.refundTitle, meta: t.metaRefund, icon: 'rupee', items: t.refundSections.map((s) => ({ h: s.h, p: s.p })) },
  }[kind];
  usePageMeta(page.title, page.meta);
  return (
    <div className="page">
      <SectionHeading as="h1" icon={page.icon} title={page.title} />
      <div className="info-page">
        {page.items.map((item) => (
          <section key={item.h} className="info-block">
            <h2><Icon name="check" size={22} />{item.h}</h2>
            <p>{item.p}</p>
          </section>
        ))}
      </div>
      <p className="legal-note">{t.legalDraft}</p>
    </div>
  );
}
