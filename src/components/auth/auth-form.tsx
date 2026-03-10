'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase/config';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
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
import { LanguageSwitcher } from '@/components/language-switcher';

const formSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

const GoogleIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="mr-2 h-5 w-5">
      <path fill="#4285F4" d="M24 9.8c3.3 0 5.7 1.4 7 2.7l4.3-4.3C32.1 4.9 28.5 3 24 3 14.8 3 7.3 8.5 4.4 16.5l5.4 4.2C11.3 14.3 17.2 9.8 24 9.8z"/>
      <path fill="#34A853" d="M46.2 25.1c0-1.6-.1-3.2-.4-4.7H24v8.9h12.4c-.5 2.9-2.2 5.4-4.8 7.1l5.4 4.2c3.1-2.9 4.9-7.1 4.9-12.1-.1-.8-.1-1.6-.3-2.4z"/>
      <path fill="#FBBC05" d="M10.1 28.1c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8l-5.4-4.2C2.5 18.4 1 22.6 1 27.3s1.5 8.9 4.7 12.9l5.4-4.2z"/>
      <path fill="#EA4335" d="M24 45c4.5 0 8.1-1.5 10.7-4.1l-5.4-4.2c-1.5 1-3.4 1.6-5.3 1.6-6.8 0-12.7-4.5-14.9-10.7l-5.4 4.2C7.3 40.5 14.8 45 24 45z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
);

const GoogleButtonContent = () => {
    const { t } = useI18n();
    const text = t('auth.signInWithGoogle');
    
    const parts = text.split('Google');

    const GoogleColoredText = () => (
        <span className="font-bold">
            <span style={{ color: '#4285F4' }}>G</span>
            <span style={{ color: '#EA4335' }}>o</span>
            <span style={{ color: '#FBBC05' }}>o</span>
            <span style={{ color: '#4285F4' }}>g</span>
            <span style={{ color: '#34A853' }}>l</span>
            <span style={{ color: '#EA4335' }}>e</span>
        </span>
    );

    if (parts.length === 2) {
        return <>{parts[0]}<GoogleColoredText />{parts[1]}</>
    }
    
    return <>{text}</>
}

export function AuthForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
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
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: role,
        hasClaimedCredit: false,
        createdAt: new Date(),
      });
    }
    router.push('/dashboard');
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    const { email, password } = values;

    if (isSignUp) {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        let role: 'Admin' | 'User' = 'User';
        if (email === 'igen-personal-brand@admin.com' && password === '123456') {
          role = 'Admin';
        }
        await handleUserSetup(userCredential.user, role);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Sign Up Failed',
          description: error.message,
        });
      }
    } else {
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        await handleUserSetup(userCredential.user);
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: error.message,
        });
      }
    }
    setLoading(false);
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

  return (
    <Card className="w-full max-w-md bg-white/70 backdrop-blur-xl border-white/20 shadow-lg rounded-2xl relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <CardHeader className="text-center pt-12">
        <CardTitle className="text-2xl font-bold tracking-tight">
          <IGenLogo />
          <span>{t('app.title').replace('iGen', '')}</span>
        </CardTitle>
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
              {isSignUp ? t('auth.signUp') : t('auth.signIn')}
            </Button>
          </form>
        </Form>
        <div className="mt-4 text-center text-sm">
            {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="underline text-primary font-medium"
                disabled={loading}
            >
                {isSignUp ? t('auth.signIn') : t('auth.signUp')}
            </button>
        </div>
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
            <GoogleIcon />
            <GoogleButtonContent />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
