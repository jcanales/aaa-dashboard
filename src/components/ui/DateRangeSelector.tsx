import React, { useEffect, useRef, useState } from 'react'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { DayPicker } from 'react-day-picker'
import { format, parseISO } from 'date-fns'
import { useDateStore, computePresetRange } from '@/store/dateStore'
import type { DatePreset } from '@/store/dateStore'
import 'react-day-picker/dist/style.css'

const PRESETS: Exclude<DatePreset, 'custom'>[] = [
  'this-month', 'last-month', 'last-3-months', 'last-6-months', 'ytd', 'last-year',
]

const PRESET_LABELS: Record<Exclude<DatePreset, 'custom'>, string> = {
  'this-month':    'This Month',
  'last-month':    'Last Month',
  'last-3-months': 'Last 3 Months',
  'last-6-months': 'Last 6 Months',
  'ytd':           'Year to Date',
  'last-year':     'Last Year',
}

export function DateRangeSelector() {
  const { preset, dateFrom, dateTo, setPreset, setCustomRange } = useDateStore()
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({})
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    if (!open) return
    try {
      if (preset === 'custom' && dateFrom && dateTo) {
        setRange({ from: parseISO(dateFrom), to: parseISO(dateTo) })
      } else if (preset !== 'custom') {
        const { from, to } = computePresetRange(preset as Exclude<DatePreset, 'custom'>)
        setRange({ from, to })
      }
    } catch { /* ignore */ }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function applyCustom() {
    if (range.from && range.to) {
      setCustomRange(range.from, range.to)
      setOpen(false)
    }
  }

  const buttonLabel = (() => {
    try {
      if (preset === 'custom' && dateFrom && dateTo) {
        return `${format(parseISO(dateFrom), 'MMM d, yyyy')} – ${format(parseISO(dateTo), 'MMM d, yyyy')}`
      }
    } catch { /* fall through */ }
    return PRESET_LABELS[preset as Exclude<DatePreset, 'custom'>] ?? 'Custom Range'
  })()

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium
          bg-white border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
      >
        <CalendarDays className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
        <span>{buttonLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        // w-max: an absolutely-positioned box shrink-to-fits against its (tiny) positioned
        // parent, which collapses the two-month calendar; max-content sizing prevents that.
        <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden w-max">
          <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-100">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => { setPreset(p); setOpen(false) }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                  ${preset === p ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>

          <div className="p-3">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mb-2">Custom Range</p>
            <DayPicker
              mode="range"
              selected={{ from: range.from, to: range.to }}
              onSelect={(sel) => setRange(sel ?? {})}
              numberOfMonths={2}
              toDate={new Date()}
              classNames={{
                months: 'flex gap-4',
                caption_label: 'text-xs font-semibold text-slate-700',
                nav_button: 'text-slate-500 hover:text-slate-800',
                day_selected: 'bg-teal-700 text-white rounded',
                day_range_middle: 'bg-teal-50 text-teal-800 rounded-none',
                day_range_start: 'bg-teal-700 text-white rounded-l',
                day_range_end: 'bg-teal-700 text-white rounded-r',
                day: 'text-xs h-7 w-7 rounded hover:bg-slate-100',
                head_cell: 'text-[10px] text-slate-400 font-normal',
                table: 'border-collapse',
              }}
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400">
                {range.from && range.to
                  ? `${format(range.from, 'MMM d')} – ${format(range.to, 'MMM d, yyyy')}`
                  : 'Select a date range'}
              </span>
              <button
                onClick={applyCustom}
                disabled={!range.from || !range.to}
                className="px-3 py-1 bg-teal-700 text-white text-xs rounded-lg disabled:opacity-40 hover:bg-teal-800 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
