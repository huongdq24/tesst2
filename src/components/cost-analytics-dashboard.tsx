'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { format, startOfMonth } from 'date-fns';
import { vi } from 'date-fns/locale';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Video,
  Music,
  Image,
  FileText,
  TrendingDown,
  AlertTriangle,
  Zap,
  ArrowDownRight,
  ArrowUpRight,
  Lightbulb,
  Shield,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { firestore } from '@/lib/firebase/config';
import { Button } from '@/components/ui/button';
import { DateRangePicker, type DateRange } from '@/components/ui/date-range-picker';

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

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  video: '#ef4444',
  audio: '#f59e0b',
  image: '#3b82f6',
  text: '#06b6d4',
};

const CATEGORY_GRADIENTS: Record<string, [string, string]> = {
  video: ['#ef4444', '#dc2626'],
  audio: ['#f59e0b', '#d97706'],
  image: ['#3b82f6', '#2563eb'],
  text: ['#06b6d4', '#0891b2'],
};

const CATEGORY_LABELS: Record<string, string> = {
  video: 'Tạo Video',
  audio: 'Tạo Âm thanh',
  image: 'Tạo Hình ảnh',
  text: 'Văn bản & Token',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  video: <Video className="h-5 w-5" />,
  audio: <Music className="h-5 w-5" />,
  image: <Image className="h-5 w-5" />,
  text: <FileText className="h-5 w-5" />,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatVND(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value)) + ' ₫';
}

function formatCompact(value: number): string {
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
  return Math.round(value).toString();
}

function formatDateRangeLabel(range: DateRange): string {
  return `${format(range.from, 'dd/MM/yyyy', { locale: vi })} – ${format(range.to, 'dd/MM/yyyy', { locale: vi })}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const steps = 50;
    const increment = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayed(value);
        clearInterval(timer);
      } else {
        setDisplayed(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <span className="tabular-nums">
      {new Intl.NumberFormat('vi-VN').format(displayed)}
      {suffix}
    </span>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
      <p className="mb-1 text-xs font-medium text-zinc-400">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <p key={idx} className="text-sm font-semibold text-white">
          {formatVND(entry.value)}
        </p>
      ))}
    </div>
  );
}

function renderCustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800/50 mb-6">
        <BarChart3 className="h-10 w-10 text-zinc-600" />
      </div>
      <h3 className="text-xl font-semibold text-zinc-300 mb-2">Chưa có dữ liệu chi phí</h3>
      <p className="text-sm text-zinc-500 max-w-md">
        Dữ liệu chi phí sẽ tự động xuất hiện khi bạn bắt đầu tạo ảnh, video, hoặc audio.
        Mỗi giao dịch sẽ được ghi nhận và hiển thị tại đây theo thời gian thực.
      </p>
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function CostAnalyticsDashboard({ overrideUserId, overrideUserEmail }: { overrideUserId?: string, overrideUserEmail?: string } = {}) {
  const { user } = useAuth();
  const targetUserId = overrideUserId || user?.uid;
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchUsageLogs = async () => {
    if (!targetUserId) return;
    setIsLoading(true);
    try {
      const startDate = new Date(dateRange.from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(dateRange.to);
      endDate.setHours(23, 59, 59, 999);

      const q = query(
        collection(firestore, 'usageLogs'),
        where('userId', '==', targetUserId),
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
      setLastRefresh(new Date());
    } catch (error: any) {
      console.error('[CostDashboard] Failed to fetch usage logs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsageLogs();
  }, [targetUserId, dateRange]);

  // ─── Computed data ──────────────────────────────────────────────────────────

  const totalCost = useMemo(() => usageLogs.reduce((sum, log) => sum + log.estimatedCostVND, 0), [usageLogs]);

  const categoryData = useMemo(() => {
    const groups: Record<string, { cost: number; count: number; amount: number; unit: string }> = {};
    usageLogs.forEach((log) => {
      if (!groups[log.type]) {
        groups[log.type] = { cost: 0, count: 0, amount: 0, unit: log.unit };
      }
      groups[log.type].cost += log.estimatedCostVND;
      groups[log.type].count += 1;
      groups[log.type].amount += log.amount;
    });
    return Object.entries(groups)
      .map(([category, data]) => ({
        name: CATEGORY_LABELS[category] || category,
        value: data.cost,
        category,
        count: data.count,
        amount: data.amount,
        unit: data.unit,
        percentage: totalCost > 0 ? ((data.cost / totalCost) * 100).toFixed(1) : '0',
      }))
      .sort((a, b) => b.value - a.value);
  }, [usageLogs, totalCost]);

  const modelBreakdown = useMemo(() => {
    const groups: Record<string, { cost: number; count: number; label: string; category: string }> = {};
    usageLogs.forEach((log) => {
      const key = log.model;
      if (!groups[key]) {
        groups[key] = { cost: 0, count: 0, label: log.modelLabel || log.model, category: log.type };
      }
      groups[key].cost += log.estimatedCostVND;
      groups[key].count += 1;
    });
    return Object.entries(groups)
      .map(([model, data]) => ({
        name: data.label.length > 28 ? data.label.slice(0, 25) + '...' : data.label,
        fullName: data.label,
        cost: data.cost,
        count: data.count,
        category: data.category,
        fill: CATEGORY_COLORS[data.category] || '#71717a',
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8);
  }, [usageLogs]);

  const recentLogs = useMemo(() => usageLogs.slice(0, 20), [usageLogs]);

  const categoryCosts = useMemo(() => {
    const costs: Record<string, number> = { video: 0, audio: 0, image: 0, text: 0 };
    usageLogs.forEach((log) => {
      costs[log.type] = (costs[log.type] || 0) + log.estimatedCostVND;
    });
    return costs;
  }, [usageLogs]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!targetUserId) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-zinc-400">
        Vui lòng đăng nhập để xem chi phí.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-red-500/5 blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 h-96 w-96 rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ─── Header ──────────────────────────────────────────────────── */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-amber-500 shadow-lg shadow-red-500/20">
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Chi Phí: {overrideUserEmail || user?.email || 'API Analytics'}
              </h1>
              <p className="text-sm text-zinc-400">
                Phân tích chi phí thực tế • {formatDateRangeLabel(dateRange)}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
            />
            <Button
              variant="outline"
              size="icon"
              className="bg-zinc-800/60 border-zinc-700 text-zinc-400 hover:text-white"
              onClick={fetchUsageLogs}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            <span className="ml-3 text-zinc-400">Đang tải dữ liệu chi phí...</span>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && usageLogs.length === 0 && <EmptyState />}

        {/* Data content */}
        {!isLoading && usageLogs.length > 0 && (
          <>
            {/* ─── Summary Cards ───────────────────────────────────────── */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Total */}
              <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent" />
                <CardHeader className="relative pb-2">
                  <CardDescription className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Tổng Chi Phí</CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-bold text-white">
                    <AnimatedCounter value={totalCost} suffix=" ₫" />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <Activity className="h-3.5 w-3.5" />
                    <span>{usageLogs.length} giao dịch</span>
                  </div>
                </CardContent>
              </Card>

              {/* Video */}
              <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 via-transparent to-transparent" />
                <CardHeader className="relative pb-2">
                  <CardDescription className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5" /> Video
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-bold text-red-400">
                    <AnimatedCounter value={categoryCosts.video} suffix=" ₫" />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <span>{totalCost > 0 ? ((categoryCosts.video / totalCost) * 100).toFixed(1) : 0}% tổng bill</span>
                  </div>
                </CardContent>
              </Card>

              {/* Audio */}
              <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-transparent" />
                <CardHeader className="relative pb-2">
                  <CardDescription className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <Music className="h-3.5 w-3.5" /> Audio
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-bold text-amber-400">
                    <AnimatedCounter value={categoryCosts.audio} suffix=" ₫" />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
                    <span>{totalCost > 0 ? ((categoryCosts.audio / totalCost) * 100).toFixed(1) : 0}% tổng bill</span>
                  </div>
                </CardContent>
              </Card>

              {/* Image & Text */}
              <Card className="relative overflow-hidden border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent" />
                <CardHeader className="relative pb-2">
                  <CardDescription className="text-zinc-400 text-xs font-medium uppercase tracking-wider flex items-center gap-1.5">
                    <Image className="h-3.5 w-3.5" /> Image & Text
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative">
                  <div className="text-3xl font-bold text-cyan-400">
                    <AnimatedCounter value={categoryCosts.image + categoryCosts.text} suffix=" ₫" />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-cyan-400/70">
                    <ArrowDownRight className="h-3.5 w-3.5" />
                    <span>{totalCost > 0 ? (((categoryCosts.image + categoryCosts.text) / totalCost) * 100).toFixed(1) : 0}% tổng bill</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ─── Tabs ────────────────────────────────────────────────── */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-zinc-800/60 border border-zinc-700/50">
                <TabsTrigger value="overview" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400">
                  <PieChartIcon className="mr-1.5 h-4 w-4" />
                  Tổng quan
                </TabsTrigger>
                <TabsTrigger value="breakdown" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400">
                  <BarChart3 className="mr-1.5 h-4 w-4" />
                  Chi tiết
                </TabsTrigger>
                <TabsTrigger value="history" className="data-[state=active]:bg-zinc-700 data-[state=active]:text-white text-zinc-400">
                  <Activity className="mr-1.5 h-4 w-4" />
                  Lịch sử
                </TabsTrigger>
              </TabsList>

              {/* ═══ TAB: Overview ═══ */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Pie Chart */}
                  <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-lg text-white">Phân bổ Chi phí theo Nhóm</CardTitle>
                      <CardDescription className="text-zinc-500">Tỷ trọng chi phí từng nhóm dịch vụ</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={70}
                              outerRadius={120}
                              paddingAngle={4}
                              dataKey="value"
                              labelLine={false}
                              label={renderCustomLabel}
                              animationBegin={0}
                              animationDuration={1200}
                            >
                              {categoryData.map((entry) => (
                                <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} stroke="transparent" />
                              ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Legend */}
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {categoryData.map((cat) => (
                          <div key={cat.category} className="flex items-center gap-2 rounded-lg bg-zinc-800/50 px-3 py-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[cat.category] }} />
                            <div className="flex-1">
                              <p className="text-xs font-medium text-zinc-300">{cat.name}</p>
                              <p className="text-xs text-zinc-500">{cat.percentage}% • {cat.count} lần</p>
                            </div>
                            <p className="text-xs font-semibold text-zinc-300">{formatVND(cat.value)}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Category breakdown with progress bars */}
                  <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle className="text-lg text-white">Tỷ trọng chi phí</CardTitle>
                      <CardDescription className="text-zinc-500">Phân bổ chi phí theo loại dịch vụ</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {categoryData.map((cat) => {
                        const pct = totalCost > 0 ? (cat.value / totalCost) * 100 : 0;
                        return (
                          <div key={cat.category} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: CATEGORY_COLORS[cat.category] + '20' }}>
                                  <span style={{ color: CATEGORY_COLORS[cat.category] }}>{CATEGORY_ICONS[cat.category]}</span>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-zinc-200">{cat.name}</p>
                                  <p className="text-xs text-zinc-500">{formatVND(cat.value)} • {cat.count} giao dịch</p>
                                </div>
                              </div>
                              <Badge
                                className={`text-xs font-bold ${
                                  pct > 50
                                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                    : pct > 20
                                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                                }`}
                              >
                                {pct.toFixed(1)}%
                              </Badge>
                            </div>
                            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                  width: `${pct}%`,
                                  background: `linear-gradient(90deg, ${CATEGORY_GRADIENTS[cat.category]?.[0] || '#71717a'}, ${CATEGORY_GRADIENTS[cat.category]?.[1] || '#52525b'})`,
                                  boxShadow: `0 0 12px ${CATEGORY_COLORS[cat.category]}40`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}

                      {/* Alert if video+audio > 80% */}
                      {totalCost > 0 && ((categoryCosts.video + categoryCosts.audio) / totalCost) > 0.8 && (
                        <div className="mt-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                          <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
                            <div>
                              <p className="text-sm font-semibold text-red-400">Cảnh báo chi phí</p>
                              <p className="mt-1 text-xs text-zinc-400">
                                Video + Audio chiếm{' '}
                                <span className="font-bold text-white">
                                  {(((categoryCosts.video + categoryCosts.audio) / totalCost) * 100).toFixed(1)}%
                                </span>{' '}
                                tổng hóa đơn. Hãy cân nhắc tối ưu.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* ═══ TAB: Breakdown ═══ */}
              <TabsContent value="breakdown" className="space-y-6">
                {/* Model bar chart */}
                <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Chi phí theo Model AI</CardTitle>
                    <CardDescription className="text-zinc-500">So sánh chi phí từng model đã sử dụng</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[380px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={modelBreakdown} layout="vertical" margin={{ left: 10, right: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis type="number" tickFormatter={(v) => formatCompact(v)} tick={{ fill: '#71717a', fontSize: 12 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={200}
                            tick={{ fill: '#a1a1aa', fontSize: 11 }}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="cost" radius={[0, 6, 6, 0]} animationDuration={1200}>
                            {modelBreakdown.map((entry, index) => (
                              <Cell key={index} fill={entry.fill} fillOpacity={0.85} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Model details table */}
                <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Bảng Chi Tiết Model</CardTitle>
                    <CardDescription className="text-zinc-500">Tất cả model đã sử dụng trong kỳ</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] overflow-y-auto pr-1 space-y-2 scrollbar-thin">
                      {modelBreakdown.map((item, idx) => (
                        <div
                          key={idx}
                          className="group flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-3 py-2.5 transition-all hover:bg-zinc-800/60 hover:border-zinc-700/50"
                        >
                          <div
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: (CATEGORY_COLORS[item.category] || '#71717a') + '20' }}
                          >
                            <span style={{ color: CATEGORY_COLORS[item.category] || '#71717a' }}>{CATEGORY_ICONS[item.category]}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-zinc-300 truncate">{item.fullName}</p>
                            <p className="text-[10px] text-zinc-600 mt-0.5">
                              {item.count} lần sử dụng
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs font-bold text-zinc-200">{formatVND(item.cost)}</p>
                            <p className="text-[10px] text-zinc-600">{totalCost > 0 ? ((item.cost / totalCost) * 100).toFixed(1) : 0}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* ═══ TAB: History ═══ */}
              <TabsContent value="history" className="space-y-6">
                <Card className="border-zinc-800 bg-zinc-900/80 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-lg text-white">Lịch sử Giao dịch</CardTitle>
                    <CardDescription className="text-zinc-500">
                      {recentLogs.length} giao dịch gần nhất • {formatDateRangeLabel(dateRange)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[600px] overflow-y-auto pr-1 space-y-2 scrollbar-thin">
                      {recentLogs.map((log, idx) => {
                        const time = log.createdAt?.toDate?.();
                        const timeStr = time
                          ? `${time.getDate()}/${time.getMonth() + 1} ${time.getHours()}:${time.getMinutes().toString().padStart(2, '0')}`
                          : '—';

                        return (
                          <div
                            key={idx}
                            className="group flex items-center gap-3 rounded-xl border border-zinc-800/50 bg-zinc-800/30 px-4 py-3 transition-all hover:bg-zinc-800/60"
                          >
                            <div
                              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                              style={{ backgroundColor: (CATEGORY_COLORS[log.type] || '#71717a') + '20' }}
                            >
                              <span style={{ color: CATEGORY_COLORS[log.type] || '#71717a' }}>{CATEGORY_ICONS[log.type]}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-200 truncate">{log.modelLabel || log.model}</p>
                              <p className="text-xs text-zinc-500 truncate mt-0.5">
                                {log.prompt || '—'} • {log.amount} {log.unit}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold" style={{ color: CATEGORY_COLORS[log.type] || '#a1a1aa' }}>
                                {formatVND(log.estimatedCostVND)}
                              </p>
                              <p className="text-[10px] text-zinc-600 mt-0.5">{timeStr}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Last refresh */}
            {lastRefresh && (
              <p className="text-center text-xs text-zinc-600 mt-8">
                Cập nhật lần cuối: {lastRefresh.toLocaleTimeString('vi-VN')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
