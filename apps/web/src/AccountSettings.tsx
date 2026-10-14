import { useState, type FormEvent } from 'react';
import { ApiError, changePassword, updateProfile, type AuthUser } from './auth-client';

interface AccountSettingsProps {
  token: string;
  user: AuthUser;
  onClose: () => void;
  onUserUpdated: (user: AuthUser) => void;
}

export default function AccountSettings({ token, user, onClose, onUserUpdated }: AccountSettingsProps) {
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSavingProfile(true);
    try {
      const result = await updateProfile(token, { name: name.trim() });
      onUserUpdated(result.user);
      setName(result.user.name);
      setMessage('Your profile has been updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update your profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirmPassword) {
      setError('The new password and confirmation do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      const result = await changePassword(token, { currentPassword, newPassword });
      setMessage(result.message);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : 'Unable to update your password.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="auth-backdrop account-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-dialog account-dialog" role="dialog" aria-modal="true" aria-labelledby="account-settings-title">
        <button className="auth-close" type="button" aria-label="Close account settings" onClick={onClose}>×</button>
        <span className="section-kicker">YOUR YOZIGO ACCOUNT</span>
        <h2 id="account-settings-title">Account settings<span>.</span></h2>
        <p className="auth-intro">Update your profile and keep your account secure.</p>
        <div className="account-readonly">
          <span>Email address</span><strong>{user.email}</strong>
          <span>Account type</span><strong>{user.role === 'ADMIN' ? 'Administrator' : 'Customer'}</strong>
          <p>Email and account type cannot be changed here.</p>
        </div>
        <form className="auth-form" onSubmit={handleProfileSubmit}>
          <h3>Profile</h3>
          <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required /></label>
          <button className="auth-submit" type="submit" disabled={savingProfile || name.trim() === user.name}>{savingProfile ? 'Saving…' : 'Save profile'}</button>
        </form>
        <form className="auth-form account-password-form" onSubmit={handlePasswordSubmit}>
          <h3>Change password</h3>
          <label>Current password<input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} maxLength={72} required /></label>
          <label>New password<input autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={72} required /><span className="field-hint">Use 8–72 characters.</span></label>
          <label>Confirm new password<input autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={72} required /></label>
          <button className="auth-submit" type="submit" disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update password'}</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="account-success" role="status">{message}</p>}
      </section>
    </div>
  );
}
