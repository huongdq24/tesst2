'use client';

import React, { useState } from 'react';
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
import { Gift, Loader2 } from 'lucide-react';
import { IGenLogo } from '@/components/igen-logo';

const formSchema = z.object({
  gemini: z.string().min(1, 'Vui lòng nhập khóa API Gemini của bạn.'),
  elevenlabs: z.string().min(1, 'Vui lòng nhập khóa API ElevenLabs của bạn.'),
  heygen: z.string().min(1, 'Vui lòng nhập khóa API HeyGen của bạn.'),
});

export default function IgenXGooglePage() {
  const router = useRouter();
  const { user, userData, loading } = useAuth();
  const { toast } = useToast();
  const { t } = useI18n();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      gemini: '',
      elevenlabs: '',
      heygen: '',
    },
    mode: 'onChange',
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) return;
    setIsSaving(true);
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, {
        apiKeys: values,
        hasClaimedCredit: true,
      });
      toast({
        title: 'Thành công!',
        description: 'Khóa API đã được lưu và tín dụng đã được nhận.',
      });
      router.push('/dashboard');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: 'Không thể lưu cài đặt. Vui lòng thử lại.',
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

  if (userData?.hasClaimedCredit) {
    router.replace('/dashboard');
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
                <CardDescription>{t('apikeys.modal.description')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="gemini"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('apikeys.modal.gemini')}</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Nhập khóa Gemini của bạn" {...field} />
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
                        <Input type="password" placeholder="Nhập khóa ElevenLabs của bạn" {...field} />
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
                        <Input type="password" placeholder="Nhập khóa HeyGen của bạn" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-4">
                  <Button
                    type="submit"
                    className="w-full bg-accent hover:bg-accent/90"
                    disabled={isSaving || !form.formState.isValid}
                  >
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('credit.modal.button')} &amp; {t('onboarding.continue')}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
