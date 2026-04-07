'use client';
import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon, Wallet } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { HelpCircle, Info } from 'lucide-react';
import { PricingModal } from '@/components/modals/pricing-modal';
import { useState } from 'react';

export function Header() {
  const { user, userData } = useAuth();
  const router = useRouter();
  const { t } = useI18n();
  const [showPricing, setShowPricing] = useState(false);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/login');
  };

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
              {/* Credit Display */}
              {/* Credit Display */}
              {user && (
                <div className="flex items-center gap-1.5">
                  <Link href="/home/feature/cost-analytics" className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors hover:shadow-md hover:scale-105 active:scale-95 cursor-pointer",
                    (userData?.credits ?? 0) > 0
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                      : "bg-red-50 text-red-600 border-red-200 animate-pulse hover:bg-red-100"
                  )} title="Xem chi phí của bạn">
                    <Wallet className="h-3.5 w-3.5" />
                    <span>{((userData?.credits ?? 0) > 0) ? `${(userData?.credits ?? 0).toFixed(2)} Credit` : 'Hết credit'}</span>
                  </Link>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 rounded-full text-muted-foreground hover:text-cyan-600 hover:bg-cyan-50"
                    onClick={() => setShowPricing(true)}
                    title="Bảng giá dịch vụ"
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              )}
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
      <PricingModal isOpen={showPricing} onClose={() => setShowPricing(false)} />
    </>
  );
}
