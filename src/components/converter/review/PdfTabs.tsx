import { forwardRef } from 'react'
import { PdfViewer, type PdfViewerHandle } from './PdfViewer'

export interface PdfTabsMember {
  conversionId: string
  pdfFilename: string
}

// One PdfViewer, a tab strip to switch which member PDF it shows. The ref is
// forwarded to the active viewer so the page can still call scrollToAnchor.
export const PdfTabs = forwardRef<
  PdfViewerHandle,
  {
    operationId: string
    members: PdfTabsMember[]
    activeConversionId: string
    onSelect: (conversionId: string) => void
  }
>(function PdfTabs({ operationId, members, activeConversionId, onSelect }, ref) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-1">
        {members.map((m) => (
          <button
            key={m.conversionId}
            onClick={() => onSelect(m.conversionId)}
            className={`whitespace-nowrap rounded-t px-3 py-1 text-xs ${
              m.conversionId === activeConversionId
                ? 'bg-slate-200 font-semibold text-slate-900'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {m.pdfFilename}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <PdfViewer
          ref={ref}
          key={activeConversionId}
          conversionId={activeConversionId}
          src={`/operations/${operationId}/pdf/${activeConversionId}`}
        />
      </div>
    </div>
  )
})
