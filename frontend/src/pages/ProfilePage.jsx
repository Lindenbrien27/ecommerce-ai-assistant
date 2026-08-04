import { useEffect, useState } from 'react';
import { useAuthorizedFetch } from '../hooks/useAuthorizedFetch.js';

const ROLE_OPTIONS = ['devops', 'customer service', 'HR', 'security', 'admin'];

export function ProfilePage() {
  const authorizedFetch = useAuthorizedFetch();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await authorizedFetch('/api/account/profile');
        if (res.status === 401) return;
        if (!res.ok) {
          if (!cancelled) setError('Something went wrong loading your profile.');
          return;
        }
        const data = await res.json();
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setError("Couldn't reach the server. Please check your connection and try again.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [authorizedFetch]);

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

  if (!profile && !error) return <p className="subtitle">Loading...</p>;

  return (
    <form className="settings-form" onSubmit={handleSubmit}>
      {error && (
        <p className="verify-error" role="alert">
          {error}
        </p>
      )}

      {profile && (
        <>
          <label className="settings-field">
            <span>Name</span>
            <input type="text" value={profile.name || ''} onChange={(e) => updateField('name', e.target.value)} maxLength={100} />
          </label>

          <label className="settings-field">
            <span>Username</span>
            <input type="text" value={profile.username || ''} onChange={(e) => updateField('username', e.target.value)} maxLength={50} />
          </label>

          <label className="settings-field">
            <span>Role</span>
            <select value={profile.role || ''} onChange={(e) => updateField('role', e.target.value)}>
              <option value="">Not set</option>
              {ROLE_OPTIONS.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label className="settings-field">
            <span>Bio</span>
            <textarea value={profile.bio || ''} onChange={(e) => updateField('bio', e.target.value)} maxLength={500} rows={4} />
          </label>

          <label className="settings-field">
            <span>Photo URL</span>
            <input
              type="url"
              value={profile.photo_url || ''}
              onChange={(e) => updateField('photo_url', e.target.value)}
              placeholder="https://..."
              maxLength={2048}
            />
          </label>

          <div className="settings-actions">
            <button type="submit" className="settings-save-btn" disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {savedAt && (
              <span className="settings-saved-note" role="status">
                Saved
              </span>
            )}
          </div>
        </>
      )}
    </form>
  );
}
