/**
 * @module components/SignInModal
 * @description Modal dialog component that handles passwordless authentication by sending magic links to user email addresses
 *
 * PURPOSE:
 * - Renders a dialog modal with email input form for passwordless authentication
 * - Posts email to /api/auth/send-magic-link endpoint to trigger magic link delivery
 * - Displays success confirmation screen after successful link transmission
 * - Manages form state including loading, success, and error conditions with visual feedback
 *
 * DEPENDENCIES:
 * - @/components/ui/button - Provides styled Button component for form submission and close actions
 * - @/components/ui/input - Provides styled Input component for email field with disabled state support
 * - @/components/ui/dialog - Provides Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription for modal structure
 *
 * EXPORTS:
 * - SignInModal (component) - Controlled modal accepting isOpen boolean and onClose callback to manage visibility
 *
 * PATTERNS:
 * - Pass isOpen={modalOpen} and onClose={handleCloseModal} props to control modal visibility from parent
 * - Component auto-resets internal state (email, success, error) when onClose is triggered
 * - Shows email input form initially, then switches to success message after successful submission
 * - Displays inline error messages in red banner above submit button on API failures
 *
 * CLAUDE NOTES:
 * - Magic links expire in 15 minutes as indicated in success message to users
 * - Form prevents submission while loading=true and disables input field during API request
 * - Uses gradient background on submit button (blue-600 to purple-600) matching app branding
 * - handleClose resets all form state ensuring clean slate when modal reopens after previous submission
 */
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SignInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to send magic link');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setEmail('');
    setSuccess(false);
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            {success ? 'Check your email' : 'Sign in to StockHuntr'}
          </DialogTitle>
          <DialogDescription>
            {success
              ? "We've sent a magic link to your email. Click the link to sign in."
              : 'Enter your email to receive a magic link for passwordless sign in.'}
          </DialogDescription>
        </DialogHeader>

        {!success ? (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="h-12"
            />

            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
                {error}
              </p>
            )}

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Magic Link'}
            </Button>

            <p className="text-xs text-slate-500 text-center">
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-sm text-green-800">
                We sent an email to <strong>{email}</strong>
              </p>
              <p className="text-xs text-green-700 mt-2">
                The link expires in 15 minutes.
              </p>
            </div>

            <Button
              onClick={handleClose}
              variant="outline"
              className="w-full"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
