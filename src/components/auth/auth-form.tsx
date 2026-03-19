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
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
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
        id: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: role,
        hasClaimedCredit: false,
        createdAt: new Date(),
      });
    }
    router.push('/igen-x-google');
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setLoading(true);
    const { email, password } = values;

    if (isSignUp) {
        try {
          const newUserCredential = await createUserWithEmailAndPassword(auth, email, password);
          let role: 'Admin' | 'User' = 'User';
          if (email === 'igen-personal-brand@admin.com' && password === '123456') {
            role = 'Admin';
          }
          await handleUserSetup(newUserCredential.user, role);
        } catch (error: any) {
            try {
                // If sign up fails because email exists, try to sign in.
                if (error.code === 'auth/email-already-in-use') {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);
                    await handleUserSetup(userCredential.user);
                } else {
                    toast({
                        variant: 'destructive',
                        title: 'Sign Up Failed',
                        description: error.message,
                    });
                }
            } catch (signInError: any) {
                toast({
                    variant: 'destructive',
                    title: 'Authentication Failed',
                    description: signInError.message,
                });
            }
        }
    } else {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await handleUserSetup(userCredential.user);
        } catch (signInError: any) {
            toast({
                variant: 'destructive',
                title: 'Authentication Failed',
                description: signInError.message,
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
          <span> - {t('app.title').replace('iGen - ', '')}</span>
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
        <Button variant="link" className="w-full mt-2" onClick={() => setIsSignUp(!isSignUp)}>
            {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}
        </Button>
        <div className="relative my-4">
          <Separator />
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">{t('auth.or')}</span>
          </div>
        </div>
        <div className="space-y-3">
          <Button variant="outline" className="w-full hover:bg-background hover:text-foreground" onClick={handleGoogleSignIn} disabled={loading}>
            <GoogleIcon />
            <GoogleButtonContent />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
