'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

interface FeatureCardProps {
  slug: string;
  title: string;
  icon: React.ReactNode;
  description: string;
}

export function FeatureCard({ slug, title, icon, description }: FeatureCardProps) {
  return (
    <Link href={`/dashboard/feature/${slug}`} className="group block">
      <Card className="h-full bg-card/80 backdrop-blur-lg border-border/20 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-lg">{icon}</div>
            <h3 className="text-xl font-bold">{title}</h3>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-primary" />
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
