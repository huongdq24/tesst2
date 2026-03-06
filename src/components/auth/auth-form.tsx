'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  PhoneAuthProvider,
  signInWithPhoneNumber
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase/config';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Chrome, Phone } from 'lucide-react';

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
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { IGenLogo } from '@/components/igen-logo';
import { useI18n } from '@/contexts/i18n-context';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

export function AuthForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  const handleUserSetup = async (user: import('firebase/auth').User, role: 'Admin' | 'User' = 'User') => {
    const userDocRef = doc(firestore, 'users', user.uid);
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        role: role,
        hasClaimedCredit: false,
        createdAt: new Date(),
      });
    }
    router.push('/dashboard');
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    try {
      const { email, password } = values;
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      let role: 'Admin' | 'User' = 'User';
      if (email === 'igen-personal-brand@admin.com' && password === '123456') {
        role = 'Admin';
      }
      
      await handleUserSetup(userCredential.user, role);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Authentication Failed',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleUserSetup(result.user);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handlePhoneSignIn = () => {
      // This is a placeholder for a more complex flow involving RecaptchaVerifier
      toast({
        title: "Coming Soon",
        description: "Phone authentication will be available soon.",
      });
  }


  return (
    <Card className="w-full max-w-md bg-white/70 backdrop-blur-xl border-white/20 shadow-lg rounded-2xl">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('auth.title')} <IGenLogo />
        </CardTitle>
        <CardDescription>{t('app.title')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.email')}</FormLabel>
                  <FormControl>
                    <Input placeholder="name@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('auth.password')}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('auth.signIn')}
            </Button>
          </form>
        </Form>
        <div className="relative my-6">
          <Separator />
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t('auth.or')}</span>
          </div>
        </div>
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            <Chrome className="mr-2 h-4 w-4" />
            {t('auth.signInWithGoogle')}
          </Button>
          <Button variant="outline" className="w-full" onClick={handlePhoneSignIn} disabled={loading}>
             <Phone className="mr-2 h-4 w-4" />
            {t('auth.signInWithPhone')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
