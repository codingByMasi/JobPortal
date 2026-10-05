// Big heading with an icon tile and one short helper line.
import Icon from './Icon';

/** Section title used on Home and Jobs. */
export default function SectionHeading({ icon, title, help, as: Tag = 'h2' }) {
  return (
    <div className="section-heading">
      <div className="heading-row">
        <span className="heading-icon"><Icon name={icon} size={26} /></span>
        <Tag>{title}</Tag>
      </div>
      {help && <p className="help">{help}</p>}
    </div>
  );
}
