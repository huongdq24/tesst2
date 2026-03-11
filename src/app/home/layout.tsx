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
  const { user, loading } = useAuth();

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
  }, [user, loading, router]);

  // Show loader while the initial auth check is happening.
  const showLoader = loading || !user;

  if (showLoader) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // If we reach here, user is logged in.
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
