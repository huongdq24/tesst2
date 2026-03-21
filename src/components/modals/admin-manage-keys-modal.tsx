'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { doc, updateDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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

// We define a specific user type for this modal to keep it decoupled from the page
interface ModalUserRecord {
  uid: string;
  email: string | null;
  geminiApiKey?: string;
  elevenLabsApiKey?: string;
  heyGenApiKey?: string;
}

interface AdminManageKeysModalProps {
  user: ModalUserRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const formSchema = z.object({
  geminiApiKey: z.string().optional(),
  elevenLabsApiKey: z.string().optional(),
  heyGenApiKey: z.string().optional(),
});

export function AdminManageKeysModal({ user, open, onOpenChange, onSuccess }: AdminManageKeysModalProps) {
  const { toast } = useToast();
  const { t } = useI18n();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      geminiApiKey: '',
      elevenLabsApiKey: '',
      heyGenApiKey: '',
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        geminiApiKey: user.geminiApiKey || '',
        elevenLabsApiKey: user.elevenLabsApiKey || '',
        heyGenApiKey: user.heyGenApiKey || '',
      });
    }
  }, [user, form, open]);

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (!user) return;
    const userDocRef = doc(firestore, 'users', user.uid);
    try {
      await updateDoc(userDocRef, {
        geminiApiKey: values.geminiApiKey,
        elevenLabsApiKey: values.elevenLabsApiKey,
        heyGenApiKey: values.heyGenApiKey,
      });
      toast({
        title: 'Thành công!',
        description: `Đã cập nhật API keys cho ${user.email}.`,
      });
      onSuccess(); // Refetch data on the admin page
      onOpenChange(false); // Close the modal
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Lỗi',
        description: 'Không thể cập nhật API keys.',
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
  
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-white/70 backdrop-blur-xl border-white/20">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
              <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">Quản lý API Keys</DialogTitle>
          <DialogDescription className="text-center">
            Chỉnh sửa API Keys cho người dùng: <span className="font-bold">{user.email}</span>
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
                    <Input placeholder="Để trống để xóa key" {...field} />
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
                    <Input placeholder="Để trống để xóa key" {...field} />
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
                    <Input placeholder="Để trống để xóa key" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-4">
                <Button type="submit" className="w-full">
                  {t('apikeys.modal.save')}
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
