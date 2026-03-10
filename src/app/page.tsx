'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    // Only perform redirects once the loading state is resolved
    if (!loading) {
      if (user) {
        // User is authenticated, now check if they are onboarded
        if (userData?.hasClaimedCredit) {
          router.replace('/home'); // Go to main app
        } else {
          router.replace('/igen-x-google'); // Go to onboarding
        }
      } else {
        // No user, send to login
        router.replace('/login');
      }
    }
  }, [user, userData, loading, router]);

  // Display a full-screen loader while determining the user's auth status and destination.
  // This is the main entry point of the app.
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
    </div>
  );
}
