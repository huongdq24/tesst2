'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VideoGenerationWorkspace } from './video-generation-workspace';
import { SimpleVideoWorkspace } from './simple-video-workspace';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function VideoWorkspaceSwitcher() {
  const [mode, setMode] = useState<'simple' | 'pro'>('simple');
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById('header-actions-portal'));
  }, []);

  const switcherUI = (
    <Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full min-w-[300px] max-w-[350px]">
      <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-zinc-100/80 dark:bg-zinc-800/80 backdrop-blur rounded-xl">
        <TabsTrigger 
          value="simple" 
          className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-teal-600 dark:data-[state=active]:text-teal-400 font-semibold text-sm"
        >
          🌟 Dễ dùng (Cơ bản)
        </TabsTrigger>
        <TabsTrigger 
          value="pro"
          className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white font-semibold text-sm"
        >
          ⚙️ Chuyên gia
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="flex flex-col flex-1 h-full w-full relative">
      {portalTarget ? createPortal(switcherUI, portalTarget) : (
        <div className="flex justify-center mb-6">{switcherUI}</div>
      )}
      
      <div className="flex-1 min-h-0 flex flex-col pt-2">
        {mode === 'simple' ? <SimpleVideoWorkspace /> : <VideoGenerationWorkspace />}
      </div>
    </div>
  );
}
