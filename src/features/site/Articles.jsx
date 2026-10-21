// /articles - the list of help articles for job seekers, and /articles/:slug - one article. The words live in the language files.
import { useParams } from 'react-router-dom';
import Button from '../../shared/ui/Button';
import Icon from '../../shared/ui/Icon';
import SectionHeading from '../../shared/ui/SectionHeading';
import { Empty } from '../../shared/ui/StateViews';
import { useLang } from '../../shared/i18n/LangContext';
import { usePageMeta } from '../../shared/lib/usePageMeta';

/** The list of articles, each with its short summary and a link. */
export function ArticleList() {
  const { t } = useLang();
  usePageMeta(t.articlesTitle, t.metaArticles);
  return (
    <div className="page">
      <SectionHeading as="h1" icon="list" title={t.articlesTitle} help={t.articlesHelp} />
      <ul className="agency-list">
        {t.articles.map((a) => (
          <li key={a.slug} className="agency-card">
            <h2 className="agency-name"><Icon name="check" size={24} />{a.title}</h2>
            <p className="help">{a.summary}</p>
            <Button size="sm" tone="outline" icon="search" to={`/articles/${a.slug}`}>{t.articleRead}</Button>
          </li>
        ))}
      </ul>
      <Button to="/cv" tone="blue" icon="edit">{t.cvTitle}</Button>
      <p className="legal-note">{t.articleDisclaimer}</p>
    </div>
  );
}

/** One article. An unknown address shows a plain message with a way back. */
export function ArticlePage() {
  const { t } = useLang();
  const { slug } = useParams();
  const article = t.articles.find((a) => a.slug === slug);
  usePageMeta(article ? article.title : t.articlesTitle, article ? article.summary : t.metaArticles);
  if (!article) {
    return (
      <div className="page">
        <Empty text={t.articleNotFound} icon="list"><Button to="/articles" tone="outline" icon="list">{t.articlesTitle}</Button></Empty>
      </div>
    );
  }
  return (
    <div className="page">
      <SectionHeading as="h1" icon="list" title={article.title} help={article.summary} />
      <div className="info-page">
        {article.sections.map((s) => (
          <section key={s.h} className="info-block">
            <h2><Icon name="check" size={22} />{s.h}</h2>
            <p>{s.p}</p>
          </section>
        ))}
      </div>
      <div className="actions">
        {article.slug === 'cv-tips' && <Button to="/cv" tone="blue" icon="edit">{t.cvTitle}</Button>}
        {article.slug === 'before-you-pay' && <Button tone="blue" icon="search" href="https://emigrate.gov.in" target="_blank" rel="noopener noreferrer">{t.checkOpenEmigrate}</Button>}
        <Button to="/articles" tone="outline" icon="list">{t.articleBack}</Button>
      </div>
      <p className="legal-note">{t.articleDisclaimer}</p>
    </div>
  );
}
