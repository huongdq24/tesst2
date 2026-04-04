"use client"

import * as React from "react"
import { format, subDays, startOfMonth, endOfMonth, startOfYear } from "date-fns"
import { vi } from "date-fns/locale"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export interface DateRange {
  from: Date
  to: Date
}

interface DateRangePreset {
  label: string
  getValue: () => DateRange
}

const presets: DateRangePreset[] = [
  {
    label: "Tháng này",
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: new Date(),
    }),
  },
  {
    label: "Tháng trước",
    getValue: () => {
      const d = new Date()
      d.setMonth(d.getMonth() - 1)
      return {
        from: startOfMonth(d),
        to: endOfMonth(d),
      }
    },
  },
  {
    label: "30 ngày qua",
    getValue: () => ({
      from: subDays(new Date(), 30),
      to: new Date(),
    }),
  },
  {
    label: "90 ngày qua",
    getValue: () => ({
      from: subDays(new Date(), 90),
      to: new Date(),
    }),
  },
  {
    label: "Từ đầu năm",
    getValue: () => ({
      from: startOfYear(new Date()),
      to: new Date(),
    }),
  },
]

const DAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"]

// ─── Mini Calendar Component ─────────────────────────────────────────────────

function MiniCalendar({
  month,
  year,
  selectedFrom,
  selectedTo,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
}: {
  month: number
  year: number
  selectedFrom: Date | null
  selectedTo: Date | null
  onSelectDate: (date: Date) => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDayOfWeek = firstDay.getDay() // 0=Sun
  const daysInMonth = lastDay.getDate()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const monthLabel = format(firstDay, "MMMM yyyy", { locale: vi })

  // Build calendar grid
  const cells: (number | null)[] = []
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const isInRange = (date: Date) => {
    if (!selectedFrom || !selectedTo) return false
    return date >= selectedFrom && date <= selectedTo
  }

  const isSelected = (date: Date) => {
    if (selectedFrom && date.getTime() === selectedFrom.getTime()) return true
    if (selectedTo && date.getTime() === selectedTo.getTime()) return true
    return false
  }

  const isToday = (date: Date) => date.getTime() === today.getTime()

  return (
    <div className="select-none">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={onPrevMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-700/50 hover:text-white transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-zinc-200 capitalize">{monthLabel}</span>
        <button
          onClick={onNextMonth}
          className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-700/50 hover:text-white transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_VI.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-zinc-500 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} className="h-9 w-9" />

          const date = new Date(year, month, day)
          date.setHours(0, 0, 0, 0)
          const selected = isSelected(date)
          const inRange = isInRange(date)
          const todayMark = isToday(date)

          return (
            <button
              key={idx}
              onClick={() => onSelectDate(date)}
              className={cn(
                "h-9 w-9 text-sm rounded-full flex items-center justify-center transition-all",
                selected
                  ? "bg-blue-500 text-white font-semibold shadow-lg shadow-blue-500/20"
                  : inRange
                    ? "bg-blue-500/10 text-blue-300"
                    : todayMark
                      ? "text-blue-400 font-semibold ring-1 ring-blue-500/40"
                      : "text-zinc-300 hover:bg-zinc-700/50 hover:text-white"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main DateRangePicker ────────────────────────────────────────────────────

interface DateRangePickerProps {
  dateRange: DateRange
  onDateRangeChange: (range: DateRange) => void
  className?: string
}

export function DateRangePicker({
  dateRange,
  onDateRangeChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [activePreset, setActivePreset] = React.useState<string>("Tháng này")
  const [selectingField, setSelectingField] = React.useState<"from" | "to">("from")
  const [tempFrom, setTempFrom] = React.useState<Date>(dateRange.from)
  const [tempTo, setTempTo] = React.useState<Date>(dateRange.to)
  const [viewMonth, setViewMonth] = React.useState(dateRange.from.getMonth())
  const [viewYear, setViewYear] = React.useState(dateRange.from.getFullYear())
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Sync when props change
  React.useEffect(() => {
    setTempFrom(dateRange.from)
    setTempTo(dateRange.to)
  }, [dateRange])

  // Close on outside click
  React.useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handlePresetClick = (preset: DateRangePreset) => {
    const range = preset.getValue()
    setActivePreset(preset.label)
    setTempFrom(range.from)
    setTempTo(range.to)
    onDateRangeChange(range)
    setOpen(false)
  }

  const handleDateSelect = (date: Date) => {
    if (selectingField === "from") {
      setTempFrom(date)
      setSelectingField("to")
      setActivePreset("")
      // If new from is after current to, reset to
      if (date > tempTo) {
        setTempTo(date)
      }
    } else {
      if (date < tempFrom) {
        // If to < from, swap
        setTempTo(tempFrom)
        setTempFrom(date)
      } else {
        setTempTo(date)
      }
      setSelectingField("from")
      setActivePreset("")
    }
  }

  const handleApply = () => {
    onDateRangeChange({ from: tempFrom, to: tempTo })
    setOpen(false)
  }

  const handleCancel = () => {
    setTempFrom(dateRange.from)
    setTempTo(dateRange.to)
    setOpen(false)
  }

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const formatTrigger = () => {
    if (activePreset) return activePreset
    return `${format(dateRange.from, "dd/MM/yyyy")} – ${format(dateRange.to, "dd/MM/yyyy")}`
  }

  return (
    <div ref={containerRef} className="relative">
      {/* ───── Trigger Button ───── */}
      <Button
        variant="outline"
        onClick={() => {
          setOpen(!open)
          setViewMonth(dateRange.from.getMonth())
          setViewYear(dateRange.from.getFullYear())
        }}
        className={cn(
          "justify-start text-left font-normal bg-zinc-800/60 border-zinc-700 text-zinc-200 hover:bg-zinc-700/60 hover:text-white transition-all",
          className
        )}
      >
        <CalendarDays className="mr-2 h-4 w-4 text-zinc-400" />
        <span className="truncate">{formatTrigger()}</span>
        <ChevronDown className={cn("ml-2 h-3.5 w-3.5 text-zinc-500 transition-transform", open && "rotate-180")} />
      </Button>

      {/* ───── Dropdown Panel ───── */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[340px] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60 animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
          style={{ zIndex: 9999 }}
        >
          <div className="p-4 space-y-4">
            {/* ── Title ── */}
            <p className="text-sm font-semibold text-zinc-200">Khoảng thời gian</p>

            {/* ── From / To Fields ── */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSelectingField("from")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-all",
                  selectingField === "from"
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                )}
              >
                <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Từ ngày</p>
                <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                  {format(tempFrom, "dd/MM/yyyy")}
                </p>
              </button>
              <button
                onClick={() => setSelectingField("to")}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left transition-all",
                  selectingField === "to"
                    ? "border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/30"
                    : "border-zinc-700 bg-zinc-800/50 hover:border-zinc-600"
                )}
              >
                <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Đến ngày</p>
                <p className="text-sm font-semibold text-zinc-200 mt-0.5">
                  {format(tempTo, "dd/MM/yyyy")}
                </p>
              </button>
            </div>

            {/* ── Preset Chips ── */}
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const isActive = activePreset === preset.label
                return (
                  <button
                    key={preset.label}
                    onClick={() => handlePresetClick(preset)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border",
                      isActive
                        ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                        : "bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:bg-zinc-700/50 hover:text-zinc-200 hover:border-zinc-600"
                    )}
                  >
                    {isActive && <Check className="h-3 w-3" />}
                    {preset.label}
                  </button>
                )
              })}
            </div>

            {/* ── Calendar ── */}
            <div className="border-t border-zinc-700/50 pt-3">
              <MiniCalendar
                month={viewMonth}
                year={viewYear}
                selectedFrom={tempFrom}
                selectedTo={tempTo}
                onSelectDate={handleDateSelect}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
              />
            </div>

            {/* ── Actions ── */}
            <div className="flex justify-end gap-2 border-t border-zinc-700/50 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="text-zinc-400 hover:text-white hover:bg-zinc-800 text-xs h-8"
              >
                Hủy
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs h-8 px-5"
              >
                Áp dụng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
