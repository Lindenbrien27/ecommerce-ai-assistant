import { NavLink } from 'react-router-dom';
import { CardIcon, PersonIcon, PinIcon } from './icons.jsx';

// Shared tab-nav shell for the three account-settings pages (Profile/
// Address/Payment) - real NavLinks to real routes (so each keeps its own
// URL, back-button behavior, and Layout.jsx page header) rendered inside
// the reui-reference's left-nav/right-panel grid, rather than client-only
// tab state that would collapse all three into one URL.
export function SettingsLayout({ children }) {
  return (
    <div className="settings-grid">
      <nav className="settings-nav">
        <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
          <PersonIcon /> Profile
        </NavLink>
        <NavLink to="/address" className={({ isActive }) => (isActive ? 'active' : '')}>
          <PinIcon /> Address
        </NavLink>
        <NavLink to="/payment" className={({ isActive }) => (isActive ? 'active' : '')}>
          <CardIcon /> Payment
        </NavLink>
      </nav>
      <div className="settings-content">{children}</div>
    </div>
  );
}
