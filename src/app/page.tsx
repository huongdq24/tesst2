'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        // User is logged in, check if they have completed onboarding
        if (userData?.hasClaimedCredit) {
          router.replace('/home'); // Onboarded, go to home
        } else {
          router.replace('/igen-x-google'); // Not onboarded, go to onboarding
        }
      } else {
        // No user, go to login
        router.replace('/login');
      }
    }
  }, [user, userData, loading, router]);

  // Show a loader while determining the route
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}
