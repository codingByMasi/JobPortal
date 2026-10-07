// /jobs/uae, /jobs/saudi-arabia ...: the ads of one country on a page of its own (own title, text and address for search engines).
import { useParams } from 'react-router-dom';
import Jobs from './Jobs';
import NotFound from '../site/NotFound';
import { countryBySlug } from '../../shared/lib/catalog';

/** Landing page for one country. An unknown address shows the normal "not found" page. */
export default function CountryJobs() {
  const { countrySlug } = useParams();
  const country = countryBySlug(countrySlug);
  if (!country) return <NotFound />;
  return <Jobs key={country.id} fixedCountry={country.id} />;
}
