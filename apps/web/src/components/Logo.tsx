import { Link } from 'react-router-dom';

export function Logo() {
  return <Link to="/" className="logo" aria-label="CineHorizon home"><span>Cine</span><strong>Horizon</strong></Link>;
}
