"use client";

import React, { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';

export default function ResetConfirmPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const oobCode = searchParams.get('oobCode');
  const flow = searchParams.get('flow');
  const isPasswordResetReturn = flow === 'password-reset';
  const [manualCode, setManualCode] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const activeCode = oobCode || (manualCode || null);

  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!activeCode) return;
    // Try to verify code to display associated email
    verifyPasswordResetCode(auth, activeCode)
      .then((email) => setEmail(email))
      .catch(() => setEmail(null));
  }, [activeCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCode) {
      setError('Invalid or missing reset code.');
      return;
    }

    if (!password || password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await confirmPasswordReset(auth, activeCode, password);
      setSuccess(true);
      try { localStorage.setItem('abjee:passwordResetSuccess', '1'); } catch { /* ignore */ }
    } catch (err: any) {
      setError(err?.message || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  // If there is no code in the URL, show a helpful CTA and allow pasting a code manually
  if (!oobCode && !manualCode) {
    if (isPasswordResetReturn) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-8 shadow border border-gray-200 dark:border-gray-700">
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">Password Changed Successfully</p>
              <p className="text-sm text-green-700 dark:text-green-300">Your password was changed successfully. Continue to sign in.</p>
            </div>
            <Button onClick={() => router.push('/auth')} className="w-full">
              Continue
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-8 shadow border border-gray-200 dark:border-gray-700">
          <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Missing reset code</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">We couldn't find a reset code in the link. You can request a new reset email or paste the code manually.</p>

          <div className="mb-4">
            <div className="flex gap-3 mb-3">
              <Button onClick={() => router.push('/auth/reset')} className="w-1/2">Request reset email</Button>
              <Button onClick={() => setShowPaste(true)} variant="outline" className="w-1/2">Paste code</Button>
            </div>
            {showPaste && (
              <div className="flex gap-2">
                <input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Paste oobCode here"
                  className="w-full rounded-md border px-3 py-2"
                />
                <Button onClick={() => { setShowPaste(false); }} disabled={!manualCode}>
                  Use code
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl p-8 shadow border border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Set a new password</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{email ? `Resetting password for ${email}` : 'Set a new password for your account.'}</p>

        {!oobCode && manualCode && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">Using pasted reset code. If this doesn't work, request a new reset email.</p>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {success ? (
          <div className="space-y-4">
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm font-semibold text-green-700 dark:text-green-300">Password Changed Successfully</p>
              <p className="text-sm text-green-700 dark:text-green-300">Your password was changed successfully. Continue to sign in.</p>
            </div>
            <Button onClick={() => router.push('/auth')} className="w-full">
              Continue
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="password" className="text-gray-700 dark:text-gray-300">New password</Label>
              <div className="relative mt-2">
                <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="pr-10" required minLength={6} />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirm" className="text-gray-700 dark:text-gray-300">Confirm new password</Label>
              <div className="relative mt-2">
                <Input id="confirm" type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="pr-10" required minLength={6} aria-invalid={!!(confirmPassword && password !== confirmPassword)} />
                <button
                  type="button"
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                  onClick={() => setShowConfirm((s) => !s)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-600 mt-2">Passwords do not match.</p>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
