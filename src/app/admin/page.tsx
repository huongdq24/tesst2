'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Shield, Users } from 'lucide-react';
interface UserRecord {
  uid: string;
  email: string | null;
  displayName?: string;
  role: 'Admin' | 'User';
  geminiApiKey?: string;
  elevenLabsApiKey?: string;
  heyGenApiKey?: string;
  createdAt?: any;
}
const maskKey = (key?: string): string => {
  if (!key) return '—';
  if (key.length <= 8) return '••••' + key.slice(-4);
  return '••••••••' + key.slice(-4);
};
export default function AdminPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (userData?.role !== 'Admin') {
      router.replace('/home');
      return;
    }
    fetchUsers();
  }, [user, userData, loading, router]);
  const fetchUsers = async () => {
    setIsFetching(true);
    try {
      const snapshot = await getDocs(collection(firestore, 'users'));
      const userList: UserRecord[] = snapshot.docs.map((doc) => ({
        uid: doc.id,
        ...doc.data(),
      } as UserRecord));
      setUsers(userList);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsFetching(false);
    }
  };
  if (loading || isFetching) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Quản lý tất cả người dùng và API keys</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="text-2xl font-bold">{users.length}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Đã cài Gemini Key</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-600">
              {users.filter((u) => !!u.geminiApiKey).length}
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Chưa cài API Key</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-red-500">
              {users.filter((u) => !u.geminiApiKey).length}
            </span>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh Sách Người Dùng</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead>Gemini API Key</TableHead>
                <TableHead>ElevenLabs Key</TableHead>
                <TableHead>HeyGen Key</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.uid}>
                  <TableCell className="font-medium">{u.email ?? '—'}</TableCell>
                  <TableCell>{u.displayName ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'Admin' ? 'default' : 'secondary'}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {u.geminiApiKey ? (
                      <span className="text-green-600">{maskKey(u.geminiApiKey)}</span>
                    ) : (
                      <span className="text-red-400 italic text-xs">Chưa cài</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {u.elevenLabsApiKey ? maskKey(u.elevenLabsApiKey) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {u.heyGenApiKey ? maskKey(u.heyGenApiKey) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
