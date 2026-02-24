/**
 * @module components/UserMenu
 * @description React component rendering user authentication UI with dropdown menu for authenticated users or sign-in button for guests
 *
 * PURPOSE:
 * - Fetch current user session from /api/auth/me endpoint on component mount
 * - Display loading skeleton during authentication check
 * - Render sign-in button and modal for unauthenticated users
 * - Show dropdown menu with user avatar, email, tier, and navigation links for authenticated users
 * - Handle sign-out via /api/auth/signout POST request and refresh router state
 *
 * DEPENDENCIES:
 * - react - Provides useState for user/loading state and useEffect for mount-time auth check
 * - next/navigation - useRouter for programmatic navigation to watchlist/profile and refresh after sign-out
 * - @/components/ui/button - Button component for sign-in trigger and dropdown menu trigger
 * - @/components/ui/dropdown-menu - Dropdown components for authenticated user menu structure
 * - ./SignInModal - Modal component displayed when unauthenticated user clicks sign-in button
 *
 * EXPORTS:
 * - UserMenu (component) - Main component rendering authentication-aware UI with conditional sign-in button or user dropdown menu
 * - User (interface) - Type definition with id, email, optional name, and tier string properties
 *
 * PATTERNS:
 * - Place in navigation header or top bar; automatically fetches user on mount
 * - Component handles three states: loading (skeleton), unauthenticated (sign-in button), authenticated (dropdown menu)
 * - Dropdown menu navigates to /watchlist and /profile routes via router.push()
 * - Sign-out calls handleSignOut() which POSTs to /api/auth/signout, clears user state, and calls router.refresh()
 *
 * CLAUDE NOTES:
 * - Uses optimistic UI pattern - sign-out immediately clears user state before server response
 * - Avatar displays first letter of email in uppercase within gradient circle when authenticated
 * - Loading state shows 24px tall skeleton with pulse animation matching button dimensions
 * - Tier plan label is capitalized and styled in blue-600 within dropdown header
 * - No error handling for failed sign-in - errors logged to console but UI doesn't show feedback
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SignInModal } from './SignInModal';

interface User {
  id: string;
  email: string;
  name?: string;
  tier: string;
}

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSignIn, setShowSignIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/signout', { method: 'POST' });
      setUser(null);
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="h-10 w-24 bg-slate-200 animate-pulse rounded-md"></div>
    );
  }

  if (!user) {
    return (
      <>
        <Button
          onClick={() => setShowSignIn(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
        >
          Signup / Signin
        </Button>
        <SignInModal isOpen={showSignIn} onClose={() => setShowSignIn(false)} />
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white font-semibold">
            {user.email[0].toUpperCase()}
          </div>
          <span className="hidden sm:inline">{user.email}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div>
            <p className="font-medium">{user.name || 'My Account'}</p>
            <p className="text-xs text-slate-500">{user.email}</p>
            <p className="text-xs text-blue-600 mt-1 capitalize">{user.tier} Plan</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push('/watchlist')}>
          Watchlist
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push('/profile')}>
          Profile & Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
