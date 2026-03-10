'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This component redirects from the old /auth route to the new /login route.
export default function OldAuthPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return null;
}
