'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { auth, firestore } from '@/lib/firebase/config';

interface AuthContextType {
  user: User | null;
  userData: UserData | null;
  loading: boolean;
}

export interface UserData {
  uid: string;
  email: string | null;
  role: 'Admin' | 'User';
  hasClaimedCredit?: boolean;
  geminiApiKey?: string;
  elevenLabsApiKey?: string;
  heyGenApiKey?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeSnapshot: Unsubscribe | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }

      if (currentUser) {
        setUser(currentUser);
        const userDocRef = doc(firestore, 'users', currentUser.uid);
        unsubscribeSnapshot = onSnapshot(
          userDocRef,
          (doc) => {
            if (doc.exists()) {
              setUserData(doc.data() as UserData);
            } else {
              setUserData(null);
            }
            setLoading(false); // Auth + data load is complete
          },
          (error) => {
            console.error('Error fetching user data:', error);
            setUserData(null);
            setLoading(false);
          }
        );
      } else {
        // No user is logged in
        setUser(null);
        setUserData(null);
        setLoading(false); // Auth load is complete
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
