import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../hooks/useTheme.js';
import { ChevronDownIcon, LogoutIcon, MonitorIcon, MoonIcon, QuestionIcon, SettingsIcon, SunIcon } from './icons.jsx';

const THEME_MODES = [
  { key: 'light', label: 'Light', icon: SunIcon },
  { key: 'dark', label: 'Dark', icon: MoonIcon },
  { key: 'system', label: 'System', icon: MonitorIcon },
];

// Sidebar's account menu - replaces the old decorative profile chip + the
// always-visible Logout button below it with a single real trigger and a
// floating popover, same open/close/outside-click-catcher pattern as
// CategoryBadgesEditor's own popover. An avatar+email header, the theme
// trio (a real 3-way light/dark/system control, see useTheme), a real
// Settings link (GET/PUT /api/account/profile, see SettingsPage.jsx) and
// Help & Support, and real Sign Out.
export function ProfileMenu() {
  const { email, logout } = useAuth();
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <div className="profile-menu">
      <button
        type="button"
        className="profile-menu-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${email}`}
      >
        <span className="storefront-avatar" aria-hidden="true">
          {initial}
        </span>
        <span className="storefront-profile-text">
          <span className="storefront-profile-email">{email}</span>
        </span>
        <ChevronDownIcon />
      </button>

      {open && (
        <>
          <div className="popover-catcher" onClick={() => setOpen(false)} />
          <div className="profile-menu-popover open" role="menu" aria-label="Account menu">
            <div className="profile-menu-header">
              <span className="storefront-avatar" aria-hidden="true">
                {initial}
              </span>
              <span className="profile-menu-email">{email}</span>
            </div>

            <hr className="popover-divider" />

            <p className="profile-menu-section-label">Theme</p>
            <div className="profile-menu-theme-row" role="group" aria-label="Theme">
              {THEME_MODES.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`profile-menu-theme-btn${mode === key ? ' active' : ''}`}
                  onClick={() => setMode(key)}
                  aria-pressed={mode === key}
                >
                  <Icon width="15" height="15" />
                  {label}
                </button>
              ))}
            </div>

            <hr className="popover-divider" />

            <Link to="/settings" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <SettingsIcon width="16" height="16" /> Settings
            </Link>

            <hr className="popover-divider" />

            <Link to="/chat" className="profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              <QuestionIcon width="16" height="16" /> Help &amp; Support
            </Link>
            <button
              type="button"
              className="profile-menu-item profile-menu-signout"
              role="menuitem"
              onClick={logout}
            >
              <LogoutIcon /> Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
