import { AesListDetailRow } from '@/types/aes.types'
import { aesListMockData } from './aesListMockData'

const htsCodes = [
  '8518.10.8000', '8518.21.0000', '8518.22.0000', '8518.29.8000',
  '8518.40.2000', '8518.50.0000', '8519.81.4100', '8519.89.1000',
  '8527.29.8040', '8528.72.6400',
]

export const aesListDetailMockData: AesListDetailRow[] = aesListMockData.flatMap((row) => {
  const lineCount = Math.floor(Math.random() * 4) + 1
  return Array.from({ length: lineCount }, (_, lineIndex) => ({
    ...row,
    id: `${row.id}-line-${lineIndex + 1}`,
    line: lineIndex + 1,
    hts: htsCodes[Math.floor(Math.random() * htsCodes.length)],
    qty: Math.floor(Math.random() * 100) + 1,
    value: parseFloat((row.value / lineCount).toFixed(2)),
  }))
})
