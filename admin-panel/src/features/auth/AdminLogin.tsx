import React, { useState } from 'react';
import { apiClient, setAccessToken } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import {
  AuthSuccessResponse,
  MfaConfirmResponse,
  MfaEnrollmentResponse,
  User,
} from '../../types';
import { KeyRound, Lock, ShieldAlert, User as UserIcon } from 'lucide-react';

type AuthStep = 'credentials' | 'mfa' | 'password-change' | 'mfa-enroll' | 'enrollment-confirmed' | 'activate' | 'reset';

const isAdminRole = (user: User | null): user is User => user?.role === 'ADMIN' || user?.role === 'STAFF';

export const AdminLogin: React.FC = () => {
  const { login } = useAuth();
  const query = new URLSearchParams(window.location.search);
  const activationToken = query.get('mode') === 'reset' ? null : query.get('token');
  const resetToken = query.get('mode') === 'reset' ? query.get('token') : null;
  const [step, setStep] = useState<AuthStep>(resetToken ? 'reset' : activationToken ? 'activate' : 'credentials');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [challengeCode, setChallengeCode] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [changeToken, setChangeToken] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollmentResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getErrorMessage = (err: any) =>
    err.response?.data?.error?.message || err.response?.data?.detail || err.message || 'Authentication failed. Please try again.';

  const finishAuthentication = async (result: AuthSuccessResponse) => {
    if (result.passwordChangeRequired) {
      if (!result.changeToken) throw new Error('The required password-change authorization is missing. Sign in again.');
      setChangeToken(result.changeToken);
      setStep('password-change');
      return;
    }
    if (result.mfaEnrollmentRequired) {
      if (!result.enrollToken) throw new Error('The required MFA enrollment authorization is missing. Sign in again.');
      setAccessToken(result.enrollToken);
      const enrollRes = await apiClient.post<MfaEnrollmentResponse>('/admin/auth/mfa/enroll');
      setEnrollment(enrollRes.data);
      setStep('mfa-enroll');
      return;
    }
    if (result.mfaRequired || result.requiresMfa) {
      if (!result.mfaToken && !result.mfaChallengeToken) {
        throw new Error('The required MFA challenge is missing. Sign in again.');
      }
      setMfaToken(result.mfaToken || result.mfaChallengeToken || '');
      setStep('mfa');
      return;
    }
    if (!result.accessToken || !isAdminRole(result.user)) {
      setAccessToken(null);
      throw new Error('This account is not authorized to access the admin panel.');
    }
    setAccessToken(null);
    await login(result.accessToken, result.user);
  };

  const submitCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<AuthSuccessResponse>('/admin/auth/login', { identifier, password });
      await finishAuthentication(result.data);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setAccessToken(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<AuthSuccessResponse>('/admin/auth/mfa/verify', {
        mfaToken,
        ...(recoveryMode ? { recoveryCode: challengeCode } : { code: challengeCode }),
      });
      await finishAuthentication(result.data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPasswordChange = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError('Choose a password with at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<AuthSuccessResponse>('/admin/auth/change-password', {
        changeToken,
        newPassword,
      });
      await finishAuthentication(result.data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const confirmRes = await apiClient.post<MfaConfirmResponse>(
        `/admin/auth/mfa/confirm?${new URLSearchParams({ secret: enrollment?.secret || '' }).toString()}`,
        { code: challengeCode }
      );
      setRecoveryCodes(confirmRes.data.recoveryCodes);
      setAccessToken(null);
      setStep('enrollment-confirmed');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitActivation = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!activationToken) {
      setError('The invitation link is missing its activation token.');
      return;
    }
    if (newPassword.length < 12 || newPassword !== confirmPassword) {
      setError(newPassword.length < 12 ? 'Choose a password with at least 12 characters.' : 'The new passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<AuthSuccessResponse>('/auth/activate', {
        token: activationToken,
        newPassword,
      });
      await finishAuthentication(result.data);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitPasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!resetToken) {
      setError('The password reset link is missing its token.');
      return;
    }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/.test(newPassword)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/admin/auth/reset-password', { token: resetToken, newPassword });
      setResetComplete(true);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const returnToSignIn = () => {
    window.history.replaceState({}, '', '/');
    setResetComplete(false);
    setStep('credentials');
  };

  const handleEnrollmentContinue = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await apiClient.post<AuthSuccessResponse>('/admin/auth/login', { identifier, password });
      if (
        result.data.passwordChangeRequired ||
        result.data.mfaEnrollmentRequired ||
        (!result.data.mfaRequired && !result.data.requiresMfa) ||
        (!result.data.mfaToken && !result.data.mfaChallengeToken)
      ) {
        throw new Error('MFA verification is required to complete sign-in.');
      }
      setMfaToken(result.data.mfaToken || result.data.mfaChallengeToken || '');
      setChallengeCode('');
      setRecoveryMode(false);
      setStep('mfa');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPasswordStep = step === 'password-change' || step === 'reset' || (step === 'activate' && Boolean(activationToken));
  const inputClass =
    'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-600 rounded-none font-mono';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 p-8 shadow-none">
        <div className="border-b border-slate-200 dark:border-slate-700 pb-4 mb-6">
          <div className="flex items-center space-x-2 text-blue-900 dark:text-blue-400 font-mono text-xs tracking-wider uppercase font-semibold">
            <Lock className="w-4 h-4" />
            <span>Haven Stays Management</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">
            {step === 'activate' ? 'Activate Admin Invitation' : step === 'reset' ? 'Reset Admin Password' : 'Admin Panel Access'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Restricted to authorized administrators and staff.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-xs flex items-start space-x-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === 'credentials' && (
          <form onSubmit={submitCredentials} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <span className="block mb-1">Identifier (Email or Username)</span>
              <span className="relative block">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  className={`${inputClass} pl-9`}
                  placeholder="user@havenstays.com"
                />
              </span>
            </label>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <span className="block mb-1">Password</span>
              <span className="relative block">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${inputClass} pl-9`}
                />
              </span>
            </label>
            <button type="submit" disabled={isSubmitting} className={buttonClass}>
              {isSubmitting ? 'Verifying...' : 'Sign In'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={submitMfa} className="space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 p-4">
              <label className="block text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-1">
                {recoveryMode ? 'Recovery Code' : 'Authenticator Code'}
              </label>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                {recoveryMode ? 'Enter one unused recovery code.' : 'Enter the current code from your authenticator app.'}
              </p>
              <input
                type="text"
                required
                autoFocus
                autoComplete="one-time-code"
                value={challengeCode}
                onChange={(event) => setChallengeCode(event.target.value)}
                className={`${inputClass} text-center text-lg tracking-widest`}
              />
            </div>
            <button type="button" onClick={() => { setRecoveryMode(!recoveryMode); setChallengeCode(''); }} className={secondaryButtonClass}>
              Use {recoveryMode ? 'authenticator code' : 'recovery code'} instead
            </button>
            <button type="submit" disabled={isSubmitting} className={buttonClass}>
              {isSubmitting ? 'Verifying...' : 'Verify and Continue'}
            </button>
          </form>
        )}

        {step === 'reset' && resetComplete && (
          <div className="space-y-4">
            <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300">
              Your password has been updated. You can now sign in.
            </p>
            <button type="button" onClick={returnToSignIn} className={buttonClass}>
              Return to Sign In
            </button>
          </div>
        )}

        {isPasswordStep && !(step === 'reset' && resetComplete) && (
          <form
            onSubmit={step === 'activate' ? submitActivation : step === 'reset' ? submitPasswordReset : submitPasswordChange}
            className="space-y-4"
          >
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {step === 'activate'
                ? 'Set a secure password to complete your invitation.'
                : step === 'reset'
                  ? 'Choose a new password for your admin account.'
                  : 'A password update is required before you can access the admin panel.'}
            </p>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <span className="block mb-1">New password (at least 12 characters)</span>
              <input
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <span className="block mb-1">Confirm new password</span>
              <input
                type="password"
                required
                minLength={12}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className={inputClass}
              />
            </label>
            <button type="submit" disabled={isSubmitting} className={buttonClass}>
              {isSubmitting ? 'Saving...' : step === 'activate' ? 'Activate Account' : step === 'reset' ? 'Reset Password' : 'Change Password'}
            </button>
          </form>
        )}

        {step === 'mfa-enroll' && enrollment && (
          <form onSubmit={submitEnrollment} className="space-y-4">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Set up an authenticator app before continuing. This step is required for this account.
            </p>
            <div className="flex justify-center border border-slate-200 dark:border-slate-700 bg-white p-3">
              <img src={enrollment.qrDataUrl} alt="MFA enrollment QR code" className="w-40 h-40" />
            </div>
            <div className="break-all border border-slate-200 dark:border-slate-700 p-3 text-xs">
              <div className="font-semibold uppercase mb-1">Manual setup key</div>
              <code className="font-mono">{enrollment.secret}</code>
            </div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              <span className="block mb-1">Authenticator code</span>
              <input
                type="text"
                required
                minLength={6}
                maxLength={6}
                autoComplete="one-time-code"
                value={challengeCode}
                onChange={(event) => setChallengeCode(event.target.value)}
                className={`${inputClass} text-center text-lg tracking-widest`}
              />
            </label>
            <button type="submit" disabled={isSubmitting} className={buttonClass}>
              {isSubmitting ? 'Confirming...' : 'Confirm MFA Enrollment'}
            </button>
          </form>
        )}

        {step === 'enrollment-confirmed' && (
          <div className="space-y-4">
            <div className="border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-xs text-amber-900 dark:text-amber-200">
              Save these recovery codes securely. They are shown only once.
            </div>
            <ul className="grid grid-cols-2 gap-2 border border-slate-200 dark:border-slate-700 p-3 font-mono text-xs">
              {recoveryCodes.map((code) => <li key={code}>{code}</li>)}
            </ul>
            <button type="button" onClick={handleEnrollmentContinue} disabled={isSubmitting} className={buttonClass}>
              {isSubmitting ? 'Continuing...' : 'I saved my codes — continue'}
            </button>
          </div>
        )}

        {step === 'activate' && !activationToken && (
          <p className="text-xs text-red-700 dark:text-red-300">This invitation link is missing its activation token.</p>
        )}
      </div>
    </div>
  );
};

const buttonClass =
  'w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium text-xs tracking-wider uppercase disabled:opacity-50 rounded-none cursor-pointer';

const secondaryButtonClass =
  'w-full py-2 px-3 border border-slate-300 dark:border-slate-700 text-xs uppercase font-mono text-slate-700 dark:text-slate-300 rounded-none cursor-pointer';
