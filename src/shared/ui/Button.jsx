// Big tap button with an icon. Renders a router link, a normal link, or a real button.
import { Link } from 'react-router-dom';
import Icon from './Icon';

/**
 * `tone`: green (main action), blue, outline or danger. `size="sm"` is for crowded admin tables.
 * Pass `to` for in-app links, `href` for outside links, otherwise it is a button (`type="submit"` inside forms).
 */
export default function Button({ to, href, onClick, icon, tone = 'green', size, type = 'button', disabled, children, ...rest }) {
  const className = `btn btn-${tone}${size === 'sm' ? ' btn-sm' : ''}`;
  const inner = (
    <>
      {icon && <Icon name={icon} size={size === 'sm' ? 20 : 24} />}
      <span>{children}</span>
    </>
  );
  if (to) return <Link to={to} className={className} {...rest}>{inner}</Link>;
  if (href) return <a href={href} className={className} {...rest}>{inner}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={className} {...rest}>{inner}</button>;
}
