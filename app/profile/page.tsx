'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface User {
  id: string;
  email: string;
  name?: string;
  tier: string;
  createdAt: string;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [sendingLink, setSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (data.user) {
        setUser(data.user);
        setName(data.user.name || '');
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/user/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSendMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingLink(true);
    setLinkSent(false);

    try {
      const response = await fetch('/api/auth/send-magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setLinkSent(true);
        setEmail('');
      }
    } catch (error) {
      console.error('Error sending magic link:', error);
    } finally {
      setSendingLink(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show sign-up page for non-authenticated users
  if (!user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Button
            variant="outline"
            onClick={() => router.push('/')}
            className="mb-6 border-white/45"
          >
            ← Back to Home
          </Button>

          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(15,23,42,0.85)] border border-white/40 text-muted-foreground text-xs uppercase tracking-[0.12em] mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              100% Free • No Credit Card • No Catch
            </div>

            <h1 className="text-5xl font-bold mb-4 tracking-tight">
              Start Using StockHuntr Free
            </h1>

            <p className="text-xl text-muted-foreground mb-2">
              Get instant access to AI-powered SEC filing analysis, chat with filings,
              risk scores, stock predictions, and smart alerts.
            </p>

            <p className="text-lg text-gray-200 font-semibold">
              Completely free. Forever.
            </p>
          </div>

          <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
            <CardHeader>
              <CardTitle className="text-2xl">Create Your Free Account</CardTitle>
              <CardDescription className="text-base">
                Enter your email to get started. We'll send you a magic link to sign in instantly.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {linkSent ? (
                <div className="text-center p-8 bg-green-900/20 border border-green-600 rounded-lg">
                  <div className="text-4xl mb-4">✉️</div>
                  <h3 className="text-xl font-semibold mb-2 text-green-300">Check your email!</h3>
                  <p className="text-muted-foreground">
                    We've sent a magic link to your email. Click the link to sign in and get started.
                  </p>
                  <Button
                    onClick={() => setLinkSent(false)}
                    variant="outline"
                    className="mt-4 border-white/45"
                  >
                    Send another link
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSendMagicLink} className="space-y-4">
                  <div>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={sendingLink || !email}
                    className="w-full h-12 text-base bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold shadow-[0_14px_30px_rgba(34,197,94,0.36)] hover:brightness-110"
                  >
                    {sendingLink ? 'Sending...' : 'Get Free Access →'}
                  </Button>
                </form>
              )}

              <div className="mt-6 pt-6 border-t border-white/10">
                <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider text-muted-foreground">
                  What you get (free):
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary text-lg">✓</span>
                    <span>AI-powered risk analysis and concern scoring (0-10 scale)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary text-lg">✓</span>
                    <span>Chat with any SEC filing in plain English using Claude AI</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary text-lg">✓</span>
                    <span>7-day stock performance predictions with ML models</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary text-lg">✓</span>
                    <span>Watchlist alerts via email (morning & evening digests)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary text-lg">✓</span>
                    <span>Access to 640+ tracked companies and real-time SEC feed</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary text-lg">✓</span>
                    <span>Visual charts comparing predictions vs actual performance</span>
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By signing up, you agree to our Terms of Service. We'll never spam you or share your email.
          </p>
        </div>
      </div>
    );
  }

  // Show profile page for authenticated users
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0f172a_0%,#020617_50%)] text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-6 border-white/45"
        >
          ← Back to Home
        </Button>

        <h1 className="text-4xl font-bold mb-8">Profile & Settings</h1>

        <div className="space-y-6">
          {/* Account Information */}
          <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account details and subscription status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Email</label>
                <p className="text-lg">{user?.email}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Name</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                  />
                  <Button
                    onClick={handleSave}
                    disabled={saving || name === user?.name}
                    className="bg-gradient-to-br from-primary to-secondary text-[#0b1120] font-semibold hover:brightness-110"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Plan</label>
                <div className="flex items-center gap-2">
                  <p className="text-lg capitalize">{user?.tier}</p>
                  {user?.tier === 'free' && (
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/20 border border-primary text-primary">
                      100% Free Forever
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Member Since</label>
                <p className="text-lg">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  }) : 'N/A'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Watchlist & Alerts */}
          <Card className="bg-[rgba(15,23,42,0.96)] border-white/[0.18]">
            <CardHeader>
              <CardTitle>Watchlist & Alerts</CardTitle>
              <CardDescription>
                Manage your tracked companies and alert preferences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => router.push('/watchlist')}
                variant="outline"
                className="w-full justify-start border-white/45"
              >
                Manage Watchlist →
              </Button>
              <Button
                onClick={() => router.push('/alerts')}
                variant="outline"
                className="w-full justify-start border-white/45"
              >
                Alert Settings →
              </Button>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="bg-[rgba(15,23,42,0.96)] border-red-500/30">
            <CardHeader>
              <CardTitle className="text-red-400">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible account actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                onClick={async () => {
                  if (confirm('Are you sure you want to sign out?')) {
                    await fetch('/api/auth/signout', { method: 'POST' });
                    router.push('/');
                  }
                }}
              >
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
