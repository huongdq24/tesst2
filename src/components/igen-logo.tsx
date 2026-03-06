import { cn } from "@/lib/utils"

export function IGenLogo({ className }: { className?: string }) {
  return (
    <span className={cn("text-cyan-500 font-bold", className)}>
      iGen
    </span>
  )
}
