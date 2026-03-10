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
    // Wait until the loading is fully complete before making decisions
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
    if (!userData?.hasClaimedCredit) {
      router.replace('/igen-x-google');
    }
  }, [user, userData, loading, router]);

  // Show loader while the initial check is happening, or if the user
  // doesn't meet the criteria to see the page yet (they will be redirected).
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
