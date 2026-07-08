import { format, subDays, parseISO } from 'date-fns'

export function formatDate(date: Date | string | null): string {
  if (!date) return ''
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MM/dd/yyyy')
}

export function randomDateInLastNDays(n: number): string {
  const daysAgo = Math.floor(Math.random() * n)
  return format(subDays(new Date(), daysAgo), 'MM/dd/yyyy')
}

export function todayFormatted(): string {
  return format(new Date(), 'MM/dd/yyyy')
}

export function getDatePresets() {
  const today = new Date()
  return {
    today: { from: today, to: today },
    yesterday: { from: subDays(today, 1), to: subDays(today, 1) },
    last7Days: { from: subDays(today, 6), to: today },
    last30Days: { from: subDays(today, 29), to: today },
    thisMonth: {
      from: new Date(today.getFullYear(), today.getMonth(), 1),
      to: today,
    },
    lastMonth: {
      from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      to: new Date(today.getFullYear(), today.getMonth(), 0),
    },
  }
}
