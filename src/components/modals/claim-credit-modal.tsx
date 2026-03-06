'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Gift } from 'lucide-react';
import { useI18n } from '@/contexts/i18n-context';

interface ClaimCreditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClaimCreditModal({ open, onOpenChange }: ClaimCreditModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();

  const handleClaim = async () => {
    if (!user) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, { hasClaimedCredit: true });
      toast({
        title: 'Success!',
        description: t('credit.modal.success'),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not claim credits. Please try again.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-white/70 backdrop-blur-xl border-white/20">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <Gift className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">{t('credit.modal.title')}</DialogTitle>
          <DialogDescription className="text-center">
            Start your journey with a complimentary credit boost.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Button onClick={handleClaim} className="w-full bg-accent hover:bg-accent/90">
            {t('credit.modal.button')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
