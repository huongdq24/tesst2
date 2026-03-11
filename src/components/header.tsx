'use client';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, KeyRound, Settings } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { IGenLogo } from '@/components/igen-logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/contexts/i18n-context';
import { ApiKeysModal } from '@/components/modals/api-keys-modal';
import { Badge } from '@/components/ui/badge';
export function Header() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [isApiKeysModalOpen, setIsApiKeysModalOpen] = useState(false);
  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };
  const hasGeminiKey = !!userData?.geminiApiKey;
  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0">
          <Link href="/home" className="flex items-center gap-2 text-xl font-bold">
            <IGenLogo />
            <span className="hidden sm:inline font-medium text-base text-foreground/90 whitespace-nowrap">
              - {t('app.title').replace('iGen - ', '')}
            </span>
          </Link>
          <div className="flex flex-1 items-center justify-end space-x-4">
            <nav className="flex items-center space-x-2">
              <LanguageSwitcher />
              {/* Admin Panel Link */}
              {userData?.role === 'Admin' && (
                <Link href="/admin">
                  <Button variant="outline" size="sm">
                    Admin Panel
                  </Button>
                </Link>
              )}
              {user && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.photoURL ?? ''} alt={user.displayName ?? 'User'} />
                        <AvatarFallback>
                          <UserIcon className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      {/* Red dot if Gemini key is missing */}
                      {!hasGeminiKey && (
                        <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-red-500 border-2 border-background" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">{user.displayName ?? 'Welcome'}</p>
                        <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                        {userData?.role === 'Admin' && (
                          <Badge variant="secondary" className="w-fit text-xs mt-1">Admin</Badge>
                        )}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsApiKeysModalOpen(true)} className="cursor-pointer">
                      <KeyRound className="mr-2 h-4 w-4" />
                      <span>Quản lý API Keys</span>
                      {!hasGeminiKey && (
                        <span className="ml-auto text-xs text-red-500">⚠ Chưa cài</span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>{t('header.logout')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </nav>
          </div>
        </div>
      </header>
      <ApiKeysModal open={isApiKeysModalOpen} onOpenChange={setIsApiKeysModalOpen} />
    </>
  );
}
