'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AuthForm } from '@/components/auth/auth-form';
import { Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, userData, loading } = useAuth();

  useEffect(() => {
    // If done loading, user is logged in, and user is NOT an admin, redirect to home.
    if (!loading && user) {
      if (userData?.role == 'Admin'){
      router.replace('/admin');
     }else{
      router.replace('/home')
     }
    }
  }, [user, userData, loading, router]);

  // Show a loader while checking or if redirecting a non-admin user
  if (loading || user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-gray-100 to-blue-100 p-4">
       <div className="absolute inset-0 bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(38,169,217,0.1),rgba(255,255,255,0))]"></div>
      <AuthForm />
    </main>
  );
}
