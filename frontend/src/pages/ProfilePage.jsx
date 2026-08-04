import { useCallback, useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { SettingsLayout } from '../components/SettingsLayout.jsx';
import { SettingsDropdown } from '../components/SettingsDropdown.jsx';

// The five roles named twice in the original design brief - reads as an
// internal-staff field on a customer-facing page, flagged at design time
// and again here, but implemented as specified rather than silently
// substituted.
const ROLE_OPTIONS = [
  { value: 'devops', label: 'DevOps' },
  { value: 'customer service', label: 'Customer Service' },
  { value: 'HR', label: 'HR' },
  { value: 'security', label: 'Security' },
  { value: 'admin', label: 'Admin' },
];

export function ProfilePage() {
  const authorizedFetch = useAuthorizedFetch();
  const { email } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await authorizedFetch('/api/account/profile');
      if (res.status === 401) return;
      if (!res.ok) {
        setError('Something went wrong loading your profile.');
        return;
      }
      const data = await res.json();
      setProfile(data);
      setSavedAt(null);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  function updateField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
    setSavedAt(null);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await authorizedFetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name || null,
          username: profile.username || null,
          role: profile.role || null,
          bio: profile.bio || null,
          photo_url: profile.photo_url || null,
        }),
      });
      if (res.status === 401) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Something went wrong saving your profile.');
        return;
      }
      const data = await res.json();
      setProfile(data);
      setSavedAt(new Date());
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const initial = email ? email[0].toUpperCase() : '?';

  return (
    <SettingsLayout>
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}
      {!profile && !error && <p className="subtitle">Loading...</p>}

      {profile && (
        <form className="settings-panel" onSubmit={handleSubmit}>
          <div className="settings-panel-head">
            <h2>My profile</h2>
            <p>Public account details</p>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Photo</div>
              <p className="settings-field-hint">A link to an image - this app doesn't host file uploads.</p>
            </div>
            <div className="settings-field-control">
              <div className="settings-photo-row">
                <span className="settings-photo-avatar" aria-hidden="true">
                  {initial}
                </span>
                <input
                  type="url"
                  value={profile.photo_url || ''}
                  onChange={(e) => updateField('photo_url', e.target.value)}
                  placeholder="https://..."
                  maxLength={2048}
                />
              </div>
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Full name</div>
            </div>
            <div className="settings-field-control">
              <input
                type="text"
                value={profile.name || ''}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Jane Doe"
                maxLength={100}
              />
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">
                Email address <span className="settings-verified-pill">Verified</span>
              </div>
              <p className="settings-field-hint">Your sign-in email.</p>
            </div>
            <div className="settings-field-control">
              <input type="email" value={email || ''} disabled />
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Username</div>
            </div>
            <div className="settings-field-control">
              <div className="settings-prefixed-input">
                <span>@</span>
                <input
                  type="text"
                  value={profile.username || ''}
                  onChange={(e) => updateField('username', e.target.value)}
                  placeholder="janedoe"
                  maxLength={50}
                />
              </div>
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Role</div>
            </div>
            <div className="settings-field-control">
              <SettingsDropdown
                id="profile-role-select"
                value={profile.role}
                onChange={(value) => updateField('role', value)}
                options={ROLE_OPTIONS}
                placeholder="Select a role…"
              />
            </div>
          </div>

          <div className="settings-field-row">
            <div>
              <div className="settings-field-label">Bio</div>
            </div>
            <div className="settings-field-control">
              <textarea
                rows={3}
                value={profile.bio || ''}
                onChange={(e) => updateField('bio', e.target.value)}
                placeholder="Short profile summary."
                maxLength={500}
              />
            </div>
          </div>

          <div className="settings-panel-actions">
            {savedAt && (
              <span className="settings-saved-note" role="status">
                Saved
              </span>
            )}
            <button type="button" className="settings-btn-secondary" onClick={load} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="settings-btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </SettingsLayout>
  );
}
