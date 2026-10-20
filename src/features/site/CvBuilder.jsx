// /cv - a free one-page CV maker. The visitor types, sees the CV, and prints it or saves it as a PDF with the browser. Nothing is stored or sent.
import { useState } from 'react';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { useLang } from '../../shared/i18n/LangContext';
import { cvHasContent, emptyExperience } from '../../shared/lib/cvModel';
import { usePageMeta } from '../../shared/lib/usePageMeta';
import CvForm from './CvForm';
import CvSheet from './CvSheet';

const BLANK = { name: '', phone: '', email: '', city: '', want: '', about: '', skills: '', languages: '', education: '', experience: [emptyExperience()] };

/** The CV maker screen. */
export default function CvBuilder() {
  const { t } = useLang();
  const [cv, setCv] = useState(BLANK);
  usePageMeta(t.cvTitle, t.metaCv);
  return (
    <div className="page cv-page">
      <div className="cv-screen">
        <SectionHeading as="h1" icon="edit" title={t.cvTitle} help={t.cvHelp} />
        <p className="notice"><Icon name="shield" size={26} /><span>{t.cvPrivacy}</span></p>
        <CvForm cv={cv} setCv={setCv} />
        <h2 className="section-title">{t.cvPreviewTitle}</h2>
      </div>
      <CvSheet cv={cv} />
      <div className="cv-screen">
        <Button tone="green" icon="download" disabled={!cvHasContent(cv)} onClick={() => window.print()}>{t.cvPrint}</Button>
      </div>
    </div>
  );
}
