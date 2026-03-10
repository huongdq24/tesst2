'use client';

import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, KeyRound } from 'lucide-react';

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


export function Header() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

  const maskApiKey = (key?: string) => {
    if (!key || key.length === 0) {
      return <span className="text-muted-foreground/70 italic">Not set</span>;
    }
    if (key.length <= 4) {
      return `••••${key}`;
    }
    return `••••••••${key.slice(-4)}`;
  };
  
  const ApiKeyLabel = ({ text }: { text: string }) => {
    const words = text.split(' ');
    return (
      <span className="flex-1 text-sm flex items-center">
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
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur-sm">
      <div className="container flex h-16 items-center space-x-4 sm:justify-between sm:space-x-0">
        <Link href="/home" className="flex items-center gap-2 text-xl font-bold">
          <IGenLogo />
          <span className="hidden sm:inline font-medium text-base text-foreground/90 whitespace-nowrap"> - {t('app.title').replace('iGen - ', '')}</span>
        </Link>

        <div className="flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-2">
            <LanguageSwitcher />
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
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user.displayName ?? 'Welcome'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                   <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    API Keys
                  </DropdownMenuLabel>
                   <DropdownMenuItem className="focus:bg-transparent cursor-default">
                    <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                    <ApiKeyLabel text={t('apikeys.modal.gemini')} />
                    <span className="font-mono text-xs">{maskApiKey(userData?.geminiApiKey)}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="focus:bg-transparent cursor-default">
                    <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                    <ApiKeyLabel text={t('apikeys.modal.elevenlabs')} />
                    <span className="font-mono text-xs">{maskApiKey(userData?.elevenLabsApiKey)}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="focus:bg-transparent cursor-default">
                    <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
                    <ApiKeyLabel text={t('apikeys.modal.heygen')} />
                    <span className="font-mono text-xs">{maskApiKey(userData?.heyGenApiKey)}</span>
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
  );
}
