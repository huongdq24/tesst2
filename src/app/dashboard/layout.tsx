'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Header } from '@/components/header';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    if (loading) return; // Wait until loading is finished

    if (!user) {
      router.replace('/login');
    } else if (userData && !userData.hasClaimedCredit) {
      // User is logged in, but hasn't completed the onboarding step
      router.replace('/igen-x-google');
    }
  }, [user, userData, loading, router]);

  // Show a loader while we determine where to send the user
  if (loading || !user || (userData && !userData.hasClaimedCredit)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  // User is authenticated and has completed onboarding, show the dashboard
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
