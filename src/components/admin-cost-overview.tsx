'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Video,
  Music,
  Image,
  FileText,
  Loader2,
  RefreshCw,
  Users,
  TrendingUp,
  CalendarDays,
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';

// ─── Types ───────────────────────────────────────────────────────────────────

interface UsageLog {
  userId: string;
  userEmail: string;
  type: 'image' | 'video' | 'audio' | 'text';
  model: string;
  modelLabel: string;
  amount: number;
  unit: string;
  estimatedCostVND: number;
  prompt: string;
  createdAt: Timestamp;
}

interface UserCostSummary {
  userId: string;
  email: string;
  totalCost: number;
  videoCost: number;
  audioCost: number;
  imageCost: number;
  textCost: number;
  transactionCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatVND(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value)) + ' ₫';
}

function getMonthStart(monthsAgo: number = 0): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getMonthLabel(monthsAgo: number = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  video: 'text-red-500',
  audio: 'text-amber-500',
  image: 'text-blue-500',
  text: 'text-cyan-500',
};

// ─── Main Component ──────────────────────────────────────────────────────────

export function AdminCostOverview() {
  const [selectedMonth, setSelectedMonth] = useState('0');
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');

  const fetchAllUsageLogs = async () => {
    setIsLoading(true);
    try {
      const monthsAgo = parseInt(selectedMonth);
      const startDate = getMonthStart(monthsAgo);
      const endDate = monthsAgo === 0 ? new Date() : getMonthStart(monthsAgo - 1);

      const q = query(
        collection(firestore, 'usageLogs'),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate)),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const logs: UsageLog[] = [];
      snapshot.forEach((doc) => {
        logs.push(doc.data() as UsageLog);
      });

      setUsageLogs(logs);
    } catch (error: any) {
      console.error('[AdminCost] Failed to fetch usage logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllUsageLogs();
  }, [selectedMonth]);

  // ─── Computed data ──────────────────────────────────────────────────────────

  const totalCost = useMemo(() => usageLogs.reduce((sum, log) => sum + log.estimatedCostVND, 0), [usageLogs]);

  const categoryCosts = useMemo(() => {
    const costs = { video: 0, audio: 0, image: 0, text: 0 };
    usageLogs.forEach((log) => {
      costs[log.type] = (costs[log.type] || 0) + log.estimatedCostVND;
    });
    return costs;
  }, [usageLogs]);

  const userSummaries = useMemo(() => {
    const map: Record<string, UserCostSummary> = {};
    usageLogs.forEach((log) => {
      if (!map[log.userId]) {
        map[log.userId] = {
          userId: log.userId,
          email: log.userEmail || 'unknown',
          totalCost: 0,
          videoCost: 0,
          audioCost: 0,
          imageCost: 0,
          textCost: 0,
          transactionCount: 0,
        };
      }
      const s = map[log.userId];
      s.totalCost += log.estimatedCostVND;
      s.transactionCount += 1;
      if (log.type === 'video') s.videoCost += log.estimatedCostVND;
      if (log.type === 'audio') s.audioCost += log.estimatedCostVND;
      if (log.type === 'image') s.imageCost += log.estimatedCostVND;
      if (log.type === 'text') s.textCost += log.estimatedCostVND;
    });
    return Object.values(map).sort((a, b) => b.totalCost - a.totalCost);
  }, [usageLogs]);

  const filteredLogs = useMemo(() => {
    if (selectedUserId === 'all') return usageLogs.slice(0, 50);
    return usageLogs.filter((log) => log.userId === selectedUserId).slice(0, 50);
  }, [usageLogs, selectedUserId]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-amber-500 text-white">
            <DollarSign className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Chi phí API toàn hệ thống</h2>
            <p className="text-sm text-muted-foreground">
              Theo dõi tổng chi phí của tất cả user • {getMonthLabel(parseInt(selectedMonth))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[160px]">
              <CalendarDays className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{getMonthLabel(0)}</SelectItem>
              <SelectItem value="1">{getMonthLabel(1)}</SelectItem>
              <SelectItem value="2">{getMonthLabel(2)}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAllUsageLogs} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Đang tải dữ liệu chi phí...</span>
        </div>
      )}

      {!isLoading && usageLogs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <DollarSign className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Chưa có dữ liệu chi phí nào trong kỳ này.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Dữ liệu sẽ tự động xuất hiện khi user bắt đầu tạo ảnh, video, hoặc audio.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && usageLogs.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tổng Chi Phí</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{formatVND(totalCost)}</div>
                <p className="text-xs text-muted-foreground mt-1">{usageLogs.length} giao dịch</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Video className="h-3 w-3" /> Video
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-400">{formatVND(categoryCosts.video)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Music className="h-3 w-3" /> Audio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-400">{formatVND(categoryCosts.audio)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Image className="h-3 w-3" /> Image
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-400">{formatVND(categoryCosts.image)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Users className="h-3 w-3" /> Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{userSummaries.length}</div>
                <p className="text-xs text-muted-foreground mt-1">user đã hoạt động</p>
              </CardContent>
            </Card>
          </div>

          {/* User Cost Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Chi phí theo User
                  </CardTitle>
                  <CardDescription>Xếp hạng user theo chi phí cao nhất trong kỳ</CardDescription>
                </div>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Lọc theo user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả users</SelectItem>
                    {userSummaries.map((u) => (
                      <SelectItem key={u.userId} value={u.userId}>
                        {u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative w-full overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Video</TableHead>
                      <TableHead className="text-right">Audio</TableHead>
                      <TableHead className="text-right">Image</TableHead>
                      <TableHead className="text-right">Giao dịch</TableHead>
                      <TableHead className="text-right">Tổng Chi Phí</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedUserId === 'all' ? userSummaries : userSummaries.filter(u => u.userId === selectedUserId)).map((u, idx) => (
                      <TableRow key={u.userId} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedUserId(u.userId)}>
                        <TableCell className="font-medium text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate" title={u.email}>
                          {u.email}
                        </TableCell>
                        <TableCell className={`text-right ${u.videoCost > 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>
                          {u.videoCost > 0 ? formatVND(u.videoCost) : '—'}
                        </TableCell>
                        <TableCell className={`text-right ${u.audioCost > 0 ? 'text-amber-500 font-semibold' : 'text-muted-foreground'}`}>
                          {u.audioCost > 0 ? formatVND(u.audioCost) : '—'}
                        </TableCell>
                        <TableCell className={`text-right ${u.imageCost > 0 ? 'text-blue-500 font-semibold' : 'text-muted-foreground'}`}>
                          {u.imageCost > 0 ? formatVND(u.imageCost) : '—'}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{u.transactionCount}</TableCell>
                        <TableCell className="text-right font-bold">{formatVND(u.totalCost)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Detailed transaction log for selected user */}
          {selectedUserId !== 'all' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      Lịch sử giao dịch: {userSummaries.find(u => u.userId === selectedUserId)?.email}
                    </CardTitle>
                    <CardDescription>{filteredLogs.length} giao dịch gần nhất</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedUserId('all')}>
                    ← Xem tất cả
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative w-full overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Thời gian</TableHead>
                        <TableHead>Loại</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead>Số lượng</TableHead>
                        <TableHead className="text-right">Chi phí</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log, idx) => {
                        const time = log.createdAt?.toDate?.();
                        const timeStr = time
                          ? `${time.getDate()}/${time.getMonth() + 1} ${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`
                          : '—';

                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{timeStr}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className={`text-xs ${CATEGORY_COLORS[log.type]}`}>
                                {log.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px] truncate">{log.modelLabel || log.model}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{log.amount} {log.unit}</TableCell>
                            <TableCell className={`text-right font-semibold ${CATEGORY_COLORS[log.type]}`}>
                              {formatVND(log.estimatedCostVND)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
