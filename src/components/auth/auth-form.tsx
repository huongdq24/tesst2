'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase/config';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Chrome, Phone, ArrowLeft } from 'lucide-react';

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
import { LanguageSwitcher } from '@/components/language-switcher';

// Extend window type for reCAPTCHA
declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
  }
}

const emailFormSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
});

const phoneFormSchema = z.object({
  phone: z.string().min(10, { message: 'Please enter a valid phone number with country code.' }),
});

const otpFormSchema = z.object({
  otp: z.string().length(6, { message: 'OTP must be 6 digits.' }),
});


export function AuthForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [view, setView] = useState<'email' | 'phone'>('email');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const emailForm = useForm<z.infer<typeof emailFormSchema>>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const phoneForm = useForm<z.infer<typeof phoneFormSchema>>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: '' },
  });

  const otpForm = useForm<z.infer<typeof otpFormSchema>>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { otp: '' },
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

  const onEmailSubmit = async (values: z.infer<typeof emailFormSchema>) => {
    setLoading(true);
    const { email, password } = values;
    try {
      // First, try to create a new user.
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      let role: 'Admin' | 'User' = 'User';
      if (email === 'igen-personal-brand@admin.com' && password === '123456') {
        role = 'Admin';
      }
      await handleUserSetup(userCredential.user, role);
    } catch (error: any) {
      // If the user already exists, try to sign them in.
      if (error.code === 'auth/email-already-in-use') {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          let role: 'Admin' | 'User' = 'User';
          if (email === 'igen-personal-brand@admin.com' && password === '123456') {
            role = 'Admin';
          }
          await handleUserSetup(userCredential.user, role);
        } catch (signInError: any) {
          toast({
            variant: 'destructive',
            title: 'Authentication Failed',
            description: signInError.message,
          });
        }
      } else {
        // Handle other errors during creation (e.g., weak password).
        toast({
          variant: 'destructive',
          title: 'Authentication Failed',
          description: error.message,
        });
      }
    } finally {
      setLoading(false);
    }
  };
  
  const handleSendOtp = async (values: z.infer<typeof phoneFormSchema>) => {
    setLoading(true);
    try {
        const recaptcha = new RecaptchaVerifier(auth, 'recaptcha-container', {
            size: 'invisible',
        });
        const result = await signInWithPhoneNumber(auth, values.phone, recaptcha);
        setConfirmationResult(result);
        setIsOtpSent(true);
        toast({
            title: 'OTP Sent!',
            description: `An OTP has been sent to ${values.phone}`,
        });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to send OTP',
            description: error.message,
        });
    } finally {
        setLoading(false);
    }
  };

  const handleVerifyOtp = async (values: z.infer<typeof otpFormSchema>) => {
    if (!confirmationResult) return;
    setLoading(true);
    try {
        const userCredential = await confirmationResult.confirm(values.otp);
        await handleUserSetup(userCredential.user);
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Invalid OTP',
            description: 'The code you entered is incorrect. Please try again.',
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

  const renderEmailView = () => (
    <>
      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
          <FormField
            control={emailForm.control}
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
            control={emailForm.control}
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
        <Button variant="outline" className="w-full" onClick={() => setView('phone')} disabled={loading}>
           <Phone className="mr-2 h-4 w-4" />
          {t('auth.signInWithPhone')}
        </Button>
      </div>
    </>
  );

  const renderPhoneView = () => (
    <div className='flex flex-col gap-4'>
         <Button variant="ghost" size="sm" className="self-start" onClick={() => { setView('email'); setIsOtpSent(false);}}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {!isOtpSent ? (
            <Form {...phoneForm}>
                <form onSubmit={phoneForm.handleSubmit(handleSendOtp)} className="space-y-4">
                    <FormField
                        control={phoneForm.control}
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Phone Number</FormLabel>
                                <FormControl>
                                    <Input placeholder="+1 123 456 7890" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send OTP
                    </Button>
                </form>
            </Form>
        ) : (
            <Form {...otpForm}>
                <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-4">
                     <FormField
                        control={otpForm.control}
                        name="otp"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Verification Code</FormLabel>
                                <FormControl>
                                    <Input placeholder="123456" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Verify OTP
                    </Button>
                </form>
            </Form>
        )}
    </div>
  );

  return (
    <Card className="w-full max-w-md bg-white/70 backdrop-blur-xl border-white/20 shadow-lg rounded-2xl relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <CardHeader className="text-center pt-12">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('auth.title')} <IGenLogo />
        </CardTitle>
        <CardDescription>{t('app.title')}</CardDescription>
      </CardHeader>
      <CardContent>
        {view === 'email' ? renderEmailView() : renderPhoneView()}
      </CardContent>
      <div id="recaptcha-container"></div>
    </Card>
  );
}
