'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { KeyRound } from 'lucide-react';
import { useI18n } from '@/contexts/i18n-context';
import { IGenLogo } from '../igen-logo';

interface ApiKeysModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const formSchema = z.object({
  geminiApiKey: z.string().optional(),
  elevenLabsApiKey: z.string().optional(),
  heyGenApiKey: z.string().optional(),
});

export function ApiKeysModal({ open, onOpenChange }: ApiKeysModalProps) {
  const { user, userData } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
        geminiApiKey: userData?.geminiApiKey || '',
        elevenLabsApiKey: userData?.elevenLabsApiKey || '',
        heyGenApiKey: userData?.heyGenApiKey || '',
    }
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, values);
      toast({
        title: 'Success!',
        description: t('apikeys.modal.success'),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not save API keys. Please try again.',
      });
    }
  };

  const ApiKeyLabel = ({ text }: { text: string }) => {
    const words = text.split(' ');
    return (
      <span className="flex items-center">
        {words.map((word, index) => {
          if (word === 'iGen') {
            return <IGenLogo key={index} />;
          }
          return <span key={index} className="ml-1">{word}</span>;
        })}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white/70 backdrop-blur-xl border-white/20">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">{t('apikeys.modal.title')}</DialogTitle>
          <DialogDescription className="text-center">
            {t('apikeys.modal.description')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
            <FormField
              control={form.control}
              name="geminiApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><ApiKeyLabel text={t('apikeys.modal.gemini')} /></FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t('apikeys.modal.gemini.placeholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="elevenLabsApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><ApiKeyLabel text={t('apikeys.modal.elevenlabs')} /></FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t('apikeys.modal.elevenlabs.placeholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="heyGenApiKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel><ApiKeyLabel text={t('apikeys.modal.heygen')} /></FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={t('apikeys.modal.heygen.placeholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">
              {t('apikeys.modal.save')}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
