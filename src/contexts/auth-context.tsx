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
import { Loader2 } from 'lucide-react';

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
      // First, always cancel any previous data listener
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }

      // If a user is logged in, begin the process of fetching their data.
      if (currentUser) {
        // Set loading to true immediately.
        // Also, set the user object, but clear the previous user's data to prevent using stale data.
        setLoading(true);
        setUser(currentUser);
        setUserData(null); // Explicitly clear old data

        const userDocRef = doc(firestore, 'users', currentUser.uid);
        
        // Listen for changes to the user's data document in Firestore.
        unsubscribeSnapshot = onSnapshot(userDocRef, (doc) => {
          if (doc.exists()) {
            // If the document exists, set the user data.
            setUserData(doc.data() as UserData);
          } else {
            // If the document does not exist, userData remains null.
            setUserData(null);
          }
          // Once data is fetched (or confirmed not to exist), loading is complete.
          setLoading(false);
        }, (error) => {
          console.error("Error fetching user data:", error);
          setUserData(null);
          setLoading(false);
        });
      } else {
        // If no user is logged in, clear all session state and stop loading.
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    // Cleanup function runs when the component unmounts.
    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  // While the initial authentication check or data fetching is in progress,
  // show a global loader. This is critical to prevent rendering any part
  // of the app with incomplete or stale information.
  if (loading) {
     return (
        <div className="flex h-screen w-screen items-center justify-center bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
        );
  }

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
