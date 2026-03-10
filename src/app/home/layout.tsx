'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Header } from '@/components/header';
import { Loader2 } from 'lucide-react';

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    // Wait until the loading is fully complete
    if (loading) {
      return;
    }

    // If loading is done and there's no user, redirect to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // If loading is done, there is a user, but their data indicates
    // they haven't completed onboarding, redirect them.
    // This covers both cases: `userData` is loaded and `hasClaimedCredit` is false,
    // or `userData` is `null` (meaning doc doesn't exist), which also implies onboarding is not done.
    if (!userData?.hasClaimedCredit) {
      router.replace('/igen-x-google');
    }
  }, [user, userData, loading, router]);

  // The loader should be displayed as long as we are in a transitional state.
  // 1. `loading` is true (initial auth check).
  // 2. No `user` object yet (will be redirected by useEffect, but show loader until then).
  // 3. There is a `user` but `hasClaimedCredit` is false (will be redirected, show loader until then).
  // We use `!userData?.hasClaimedCredit` which is true if `userData` is null or `hasClaimedCredit` is false.
  const showLoader = loading || !user || !userData?.hasClaimedCredit;

  if (showLoader) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If we reach here, user is logged in and has claimed credit.
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
