'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';
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
import { Button, buttonVariants } from '@/components/ui/button';
import { Loader2, Shield, Users, Image as ImageIcon, Video as VideoIcon, Pencil, Trash2, BarChart3, Coins, Plus } from 'lucide-react';
import { AdminManageKeysModal } from '@/components/modals/admin-manage-keys-modal';
import { AdminCostOverview } from '@/components/admin-cost-overview';
import CostAnalyticsDashboard from '@/components/cost-analytics-dashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteUser } from '@/app/actions/user-management';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


interface UserRecord {
  uid: string;
  email: string | null;
  displayName?: string;
  role: 'Admin' | 'User';
  credits?: number;
  geminiApiKey?: string;
  elevenLabsApiKey?: string;
  heyGenApiKey?: string;
  createdAt?: any;
  imageCount: number;
  videoCount: number;
}

export default function AdminPage() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [userToEdit, setUserToEdit] = useState<UserRecord | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserRecord | null>(null);
  const [userToViewCost, setUserToViewCost] = useState<UserRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [totalImages, setTotalImages] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  // Credit management
  const [creditUser, setCreditUser] = useState<UserRecord | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [isAddingCredit, setIsAddingCredit] = useState(false);

  const fetchUsersAndMedia = useCallback(async () => {
    setIsFetching(true);
    try {
      const [usersSnapshot, genImagesSnapshot, inputImagesSnapshot, videosSnapshot] = await Promise.all([
        getDocs(collection(firestore, 'users')),
        getDocs(collection(firestore, 'generatedImages')),
        getDocs(collection(firestore, 'inputImages')),
        getDocs(collection(firestore, 'generatedVideos')),
      ]);

      const imageCounts: { [key: string]: number } = {};
      genImagesSnapshot.forEach(doc => {
        const ownerId = doc.data().ownerId;
        if (ownerId) imageCounts[ownerId] = (imageCounts[ownerId] || 0) + 1;
      });
      inputImagesSnapshot.forEach(doc => {
        const ownerId = doc.data().ownerId;
        if (ownerId) imageCounts[ownerId] = (imageCounts[ownerId] || 0) + 1;
      });

      const videoCounts: { [key: string]: number } = {};
      videosSnapshot.forEach(doc => {
        const ownerId = doc.data().ownerId;
        if (ownerId) videoCounts[ownerId] = (videoCounts[ownerId] || 0) + 1;
      });
      
      let imgTotal = 0;
      let vidTotal = 0;

      const userList: UserRecord[] = usersSnapshot.docs.map((doc) => {
        const imageCount = imageCounts[doc.id] || 0;
        const videoCount = videoCounts[doc.id] || 0;
        imgTotal += imageCount;
        vidTotal += videoCount;
        return {
          uid: doc.id,
          ...doc.data(),
          imageCount,
          videoCount,
        } as UserRecord
      });

      setUsers(userList);
      setTotalImages(imgTotal);
      setTotalVideos(vidTotal);

    } catch (error: any) {
      console.error('Failed to fetch users and media counts:', error);
      toast({ variant: 'destructive', title: 'Error', description: `Failed to fetch data: ${error.message}` });
    } finally {
      setIsFetching(false);
    }
  }, [toast]);
  
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
    fetchUsersAndMedia();
  }, [user, userData, loading, router, fetchUsersAndMedia]); 

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    const result = await deleteUser(userToDelete.uid);

    if (result.success) {
      toast({
        title: 'Đã xóa người dùng!',
        description: `Người dùng ${userToDelete.email} đã được xóa thành công.`,
      });
      fetchUsersAndMedia(); // Refresh the list
    } else {
      toast({
        variant: 'destructive',
        title: 'Lỗi xóa người dùng',
        description: result.message || 'Đã xảy ra lỗi không mong muốn.',
      });
    }
    setIsDeleting(false);
    setUserToDelete(null);
};

  const handleAddCredit = async () => {
    if (!creditUser) return;
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: 'Số tiền không hợp lệ', description: 'Vui lòng nhập số tiền lớn hơn 0.' });
      return;
    }
    setIsAddingCredit(true);
    try {
      await updateDoc(doc(firestore, 'users', creditUser.uid), {
        credits: increment(amount),
      });
      toast({ title: '✅ Nạp credit thành công!', description: `Đã nạp $${amount.toFixed(2)} cho ${creditUser.email}` });
      setCreditUser(null);
      setCreditAmount('');
      fetchUsersAndMedia();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Lỗi nạp credit', description: error.message });
    } finally {
      setIsAddingCredit(false);
    }
  };
  
  if (loading || (isFetching && users.length === 0)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <AdminManageKeysModal 
        user={userToEdit}
        open={!!userToEdit}
        onOpenChange={(open) => !open && setUserToEdit(null)}
        onSuccess={fetchUsersAndMedia}
      />
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Bạn có chắc chắn muốn xóa?</AlertDialogTitle>
                <AlertDialogDescription>
                    Hành động này không thể hoàn tác. Thao tác này sẽ xóa vĩnh viễn người dùng <strong className="font-bold">{userToDelete?.email}</strong> và tất cả dữ liệu liên quan.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Hủy</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmDelete();
                  }} 
                  disabled={isDeleting} 
                  className={cn(buttonVariants({ variant: "destructive" }))}
                >
                    {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Xóa vĩnh viễn
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!userToViewCost} onOpenChange={(open) => !open && setUserToViewCost(null)}>
        <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto bg-zinc-950 border-zinc-800 p-0">
          <DialogTitle className="sr-only">Chi tiết chi phí người dùng</DialogTitle>
          {userToViewCost && (
            <CostAnalyticsDashboard 
              overrideUserId={userToViewCost.uid} 
              overrideUserEmail={userToViewCost.email || 'User'} 
            />
          )}
        </DialogContent>
      </Dialog>
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Admin Panel</h1>
            <p className="text-muted-foreground">Quản lý tất cả người dùng và tài sản số</p>
          </div>
        </div>

        <Tabs defaultValue="users" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
            <TabsTrigger value="users">Quản lý Người Dùng</TabsTrigger>
            <TabsTrigger value="costs">Phân tích Chi Phí</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <CardTitle className="text-sm font-medium text-muted-foreground">Tổng Ảnh</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{totalImages}</span>
              </div>
            </CardContent>
          </Card>
           <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Tổng Video</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <VideoIcon className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{totalVideos}</span>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Danh Sách Người Dùng</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Credit</TableHead>
                    <TableHead>Ảnh</TableHead>
                    <TableHead>Video</TableHead>
                    <TableHead>API Keys</TableHead>
                    <TableHead className="text-right">Hành động</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.uid}>
                      <TableCell className="font-medium max-w-[200px] truncate" title={u.email ?? ''}>{u.email ?? '—'}</TableCell>
                      <TableCell>{u.displayName ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'Admin' ? 'default' : 'secondary'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            'font-mono text-sm font-semibold',
                            (u.credits ?? 0) > 0 ? 'text-emerald-600' : 'text-red-500'
                          )}>
                            ${(u.credits ?? 0).toFixed(2)}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-cyan-600 hover:text-cyan-800 hover:bg-cyan-50"
                            onClick={() => { setCreditUser(u); setCreditAmount(''); }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{u.imageCount}</TableCell>
                      <TableCell className="text-center">{u.videoCount}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <div>
                          <span className="font-semibold text-muted-foreground">Gemini: </span>
                          {u.geminiApiKey ? <span className="text-green-600 font-bold">Đã cài</span> : <span className="text-red-400">Chưa</span>}
                        </div>
                        <div>
                          <span className="font-semibold text-muted-foreground">ElevenLabs: </span>
                          {u.elevenLabsApiKey ? <span className="text-green-600 font-bold">Đã cài</span> : <span className="text-muted-foreground">Chưa</span>}
                        </div>
                        <div>
                          <span className="font-semibold text-muted-foreground">HeyGen: </span>
                          {u.heyGenApiKey ? <span className="text-green-600 font-bold">Đã cài</span> : <span className="text-muted-foreground">Chưa</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setUserToViewCost(u)}>
                                <BarChart3 className="mr-2 h-3 w-3" />
                                Chi Phí
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setUserToEdit(u)}>
                                <Pencil className="mr-2 h-3 w-3" />
                                Sửa Keys
                            </Button>
                            <Button variant="destructive" size="icon" onClick={() => setUserToDelete(u)} disabled={userData?.uid === u.uid}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="costs" className="mt-6">
            <AdminCostOverview />
          </TabsContent>
        </Tabs>
      </div>

      {/* Credit Dialog */}
      <Dialog open={!!creditUser} onOpenChange={(open) => !open && setCreditUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Nạp Credit cho {creditUser?.email}</DialogTitle>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Credit hiện tại</Label>
              <p className={cn(
                'text-lg font-bold font-mono',
                (creditUser?.credits ?? 0) > 0 ? 'text-emerald-600' : 'text-red-500'
              )}>
                ${(creditUser?.credits ?? 0).toFixed(2)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit-amount">Số tiền nạp thêm (USD)</Label>
              <Input
                id="credit-amount"
                type="text"
                placeholder="VD: 10"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="font-mono text-lg"
              />
              <div className="flex flex-wrap gap-1.5">
                {[1, 5, 10, 50, 100].map(val => (
                  <Button key={val} variant="outline" size="sm" className="text-xs" onClick={() => setCreditAmount(String(val))}>
                    ${val}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleAddCredit} disabled={isAddingCredit} className="w-full">
              {isAddingCredit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Coins className="mr-2 h-4 w-4" />}
              Nạp Credit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
