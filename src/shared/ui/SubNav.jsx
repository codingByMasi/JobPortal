// Row of big tabs for the employer area and the admin area.
import { NavLink } from 'react-router-dom';
import Icon from './Icon';

/** `items` is [{ to, icon, label, end? }]. */
export default function SubNav({ items, label }) {
  return (
    <nav className="subnav" aria-label={label}>
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `subnav-item${isActive ? ' active' : ''}`}>
          <Icon name={i.icon} size={22} />
          <span>{i.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
