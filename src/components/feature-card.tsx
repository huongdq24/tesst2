'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface FeatureCardProps {
  slug: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  imageBaseUrl?: string;
  tag?: string;
  themeColor?: string;
}

export function FeatureCard({ slug, title, icon, description, imageBaseUrl, tag, themeColor = "text-teal-500" }: FeatureCardProps) {
  // Use placeholder image if none provided
  const coverImage = imageBaseUrl || "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=800&q=80";

  return (
    <Link href={`/home/feature/${slug}`} className="group block h-full">
      <Card
        className="relative h-full overflow-hidden border-border/10 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-card rounded-2xl flex flex-col"
      >
        {/* Top Image Section */}
        <div className="relative h-48 w-full overflow-hidden flex-shrink-0">
          <div className="absolute inset-0 bg-muted animate-pulse" /> {/* Loading skeleton */}
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105 bg-zinc-200 dark:bg-zinc-800"
            style={{ backgroundImage: `url(${coverImage})` }}
          />
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />

          {/* Icon Badge */}
          <div className="absolute top-4 left-4 p-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/20 text-white z-10 transition-transform duration-300 group-hover:scale-110">
            {icon}
          </div>
        </div>

        {/* Content Section */}
        <div className="flex flex-col flex-grow p-5 sm:p-6">
          {tag && (
            <div className="mb-3">
              <span className={cn(
                "text-xs font-mono font-medium px-2.5 py-1 rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
              )}>
                {tag}
              </span>
            </div>
          )}

          <h3 className="text-xl font-bold tracking-tight text-foreground mb-2 leading-tight">
            <span className="text-teal-500 mr-2">iGen</span>
            <span className="uppercase inline">{title}</span>
          </h3>

          <p className="text-muted-foreground leading-relaxed text-sm mb-6 flex-grow">
            {description}
          </p>

          {/* Action Link */}
          <div className="mt-auto flex items-center font-semibold text-sm text-teal-500 uppercase tracking-wider group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
            SỬ DỤNG TÍNH NĂNG
            <ArrowRight className="ml-1 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
