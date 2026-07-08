import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function exportToCSV(data: object[], filename: string) {
  const csv = Papa.unparse(data)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}.csv`)
}

export function exportToXLSX(data: object[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Report')

  // Auto-width columns
  const colWidths = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(key.length, 14),
  }))
  ws['!cols'] = colWidths

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

export function exportToPDF(
  columns: string[],
  rows: (string | number)[][],
  filename: string,
  reportTitle: string,
  dateRange?: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' })

  // Header
  doc.setFillColor(7, 59, 73)  // JD Group dark teal #073b49
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 40, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('JD Group', 40, 26)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(reportTitle, 160, 26)
  if (dateRange) {
    doc.setFontSize(9)
    doc.text(dateRange, doc.internal.pageSize.getWidth() - 200, 26)
  }

  autoTable(doc, {
    head: [columns],
    body: rows,
    startY: 50,
    styles: { fontSize: 7, cellPadding: 3 },
    headStyles: { fillColor: [7, 59, 73], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: (data) => {
      const pageCount = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text(
        `Page ${data.pageNumber} of ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      )
    },
  })

  doc.save(`${filename}.pdf`)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
