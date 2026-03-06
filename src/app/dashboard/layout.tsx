'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Header } from '@/components/header';
import { ClaimCreditModal } from '@/components/modals/claim-credit-modal';
import { ApiKeysModal } from '@/components/modals/api-keys-modal';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, userData, loading } = useAuth();
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [showApiKeysModal, setShowApiKeysModal] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/auth');
      } else if (userData) {
        // Onboarding flow logic
        if (!userData.hasClaimedCredit) {
          setShowCreditModal(true);
        } else if (!userData.apiKeys || Object.keys(userData.apiKeys).length === 0 || Object.values(userData.apiKeys).every(v => !v)) {
          setShowApiKeysModal(true);
        }
      }
    }
  }, [user, userData, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  const handleCreditModalClose = (open: boolean) => {
    setShowCreditModal(open);
    // After closing credit modal, check for API keys
    if (!open && (!userData?.apiKeys || Object.keys(userData.apiKeys).length === 0 || Object.values(userData.apiKeys).every(v => !v))) {
        setShowApiKeysModal(true);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <ClaimCreditModal open={showCreditModal} onOpenChange={handleCreditModalClose} />
      <ApiKeysModal open={showApiKeysModal} onOpenChange={setShowApiKeysModal} />
    </div>
  );
}
