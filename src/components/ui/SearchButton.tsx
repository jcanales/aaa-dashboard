import React from 'react'
import { Search } from 'lucide-react'
import { useDateStore } from '@/store/dateStore'

export function SearchButton() {
  const triggerSearch = useDateStore((s) => s.triggerSearch)

  return (
    <button
      onClick={triggerSearch}
      title="Apply filters and refresh"
      className="flex items-center justify-center h-7 w-7 rounded-lg border border-teal-700 bg-teal-700 text-white
        hover:bg-teal-600 hover:border-teal-600 active:scale-95 transition-all shadow-sm flex-shrink-0"
    >
      <Search className="h-3.5 w-3.5" />
    </button>
  )
}
