'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/contexts/i18n-context';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Gift, KeyRound, Loader2 } from 'lucide-react';
import { IGenLogo } from '@/components/igen-logo';

const formSchema = z.object({
  gemini: z.string().optional(),
  elevenlabs: z.string().optional(),
  heygen: z.string().optional(),
});

export default function IgenXGooglePage() {
  const router = useRouter();
  const { user, userData, loading } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isClaiming, setIsClaiming] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: {
      gemini: userData?.apiKeys?.gemini || '',
      elevenlabs: userData?.apiKeys?.elevenlabs || '',
      heygen: userData?.apiKeys?.heygen || '',
    },
  });

  const handleClaim = async () => {
    if (!user) return;
    setIsClaiming(true);
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, { hasClaimedCredit: true });
      toast({
        title: 'Success!',
        description: t('credit.modal.success'),
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not claim credits. Please try again.',
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const onApiSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) return;
    setIsSaving(true);
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, { apiKeys: values });
      toast({
        title: 'Success!',
        description: t('apikeys.modal.success'),
      });
      router.push('/dashboard');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Could not save API keys. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-gray-100 to-blue-100 p-4">
      <div className="absolute inset-0 bg-background bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(38,169,217,0.1),rgba(255,255,255,0))]"></div>
      <div className="relative w-full max-w-2xl space-y-8">
        <div className="text-center">
          <IGenLogo className="text-4xl" />
          <h1 className="text-3xl font-bold mt-2">{t('onboarding.title')}</h1>
          <p className="text-muted-foreground">{t('onboarding.description')}</p>
        </div>

        <Card className="bg-white/70 backdrop-blur-xl border-white/20 shadow-lg rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Gift className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl">{t('credit.modal.title')}</CardTitle>
                <CardDescription>Start your journey with a complimentary credit boost.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleClaim}
              className="w-full bg-accent hover:bg-accent/90"
              disabled={isClaiming || userData?.hasClaimedCredit}
            >
              {isClaiming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {userData?.hasClaimedCredit ? 'Credit Claimed!' : t('credit.modal.button')}
            </Button>
          </CardContent>
        </Card>

        {userData?.hasClaimedCredit && (
          <Card className="bg-white/70 backdrop-blur-xl border-white/20 shadow-lg rounded-2xl animate-in fade-in-50 slide-in-from-bottom-5 duration-500">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <KeyRound className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl">{t('apikeys.modal.title')}</CardTitle>
                  <CardDescription>{t('apikeys.modal.description')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onApiSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="gemini"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('apikeys.modal.gemini')}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter your Gemini key" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="elevenlabs"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('apikeys.modal.elevenlabs')}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter your ElevenLabs key" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="heygen"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('apikeys.modal.heygen')}</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="Enter your HeyGen key" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex flex-col sm:flex-row gap-2 pt-4">
                    <Button type="submit" className="w-full" disabled={isSaving}>
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('onboarding.saveAndContinue')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => router.push('/dashboard')}
                    >
                      {t('onboarding.continue')}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
