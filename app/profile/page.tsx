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
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (!data.user) {
        router.push('/');
        return;
      }

      setUser(data.user);
      setName(data.user.name || '');
    } catch (error) {
      console.error('Error fetching user:', error);
      router.push('/');
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          className="mb-6"
        >
          ← Back to Home
        </Button>

        <h1 className="text-4xl font-bold mb-8">Profile & Settings</h1>

        <div className="space-y-6">
          {/* Account Information */}
          <Card>
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
              <CardDescription>
                Your account details and subscription status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700">Email</label>
                <p className="text-lg">{user?.email}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Name</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                  />
                  <Button
                    onClick={handleSave}
                    disabled={saving || name === user?.name}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Plan</label>
                <p className="text-lg capitalize">
                  {user?.tier} {user?.tier === 'free' && '(Upgrade coming soon)'}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700">Member Since</label>
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
          <Card>
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
                className="w-full justify-start"
              >
                Manage Watchlist →
              </Button>
              <Button
                onClick={() => router.push('/alerts')}
                variant="outline"
                className="w-full justify-start"
              >
                Alert Settings →
              </Button>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-600">Danger Zone</CardTitle>
              <CardDescription>
                Irreversible account actions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="border-red-300 text-red-600 hover:bg-red-50"
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
