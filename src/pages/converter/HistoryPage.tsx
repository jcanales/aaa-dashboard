import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, ExternalLink, Loader2, X } from 'lucide-react'
import { useConversions } from '@/hooks/converter/useConversions'
import { downloadConversionXml } from '@/api/converterApi'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/Card'

export function HistoryPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const fileFilter = params.get('file')
  const { conversions, isLoading, loadOlder, hasMore } = useConversions(fileFilter ?? undefined)

  // Every upload is its own row; this is the append-only processing log. When
  // filtered to one filename, number the runs so "processed 3×" is legible.
  // The `file` filter itself is applied server-side (useConversions passes it
  // through to GET /conversions) — this just adds the run numbering.
  const rows = useMemo(() => {
    const total = conversions.length
    return conversions.map((c, i) => ({ ...c, runLabel: fileFilter ? `run ${total - i}${i === 0 ? ' · latest' : ''}` : null }))
  }, [conversions, fileFilter])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-page-title">FTZ Converter — History</h1>
        <p className="text-page-subtitle">Every upload and its FTZ 214 conversion status — one row per processing run.</p>
      </div>

      {fileFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Showing every run of</span>
          <span className="font-medium">{fileFilter}</span>
          <button
            onClick={() => setParams({})}
            className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> clear
          </button>
        </div>
      )}

      <Card>
        <CardContent>
          {isLoading ? (
            <p className="pt-4 text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="pt-4 text-sm text-muted-foreground">No conversions{fileFilter ? ' for this file' : ''} yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2">Filename</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Uploaded</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2">
                      {fileFilter ? (
                        <span className="text-muted-foreground">{c.runLabel}</span>
                      ) : (
                        <button className="text-left hover:underline" onClick={() => setParams({ file: c.pdfFilename })}>
                          {c.pdfFilename}
                        </button>
                      )}
                    </td>
                    <td className="py-2">
                      {c.status === 'processing' ? (
                        <span className="flex items-center gap-1 uppercase text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> processing
                        </span>
                      ) : c.status === 'failed' ? (
                        <span className="uppercase text-destructive" title={c.extractionError ?? undefined}>
                          failed
                        </span>
                      ) : (
                        <span className="uppercase">{c.status}</span>
                      )}
                      {c.operationId && (
                        <button
                          type="button"
                          onClick={() => navigate(`/converter/operations/${c.operationId}`)}
                          className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          grouped →
                        </button>
                      )}
                    </td>
                    <td className="py-2">{new Date(c.createdAt).toLocaleString()}</td>
                    <td className="flex gap-2 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(c.operationId ? `/converter/operations/${c.operationId}` : `/converter/review/${c.id}`)}
                        disabled={c.status === 'processing'}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {c.status === 'generated' && (
                        <Button variant="ghost" size="icon" onClick={() => downloadConversionXml(c.id, c.pdfFilename.replace(/\.pdf$/i, '.xml'))}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {hasMore && (
            <div className="pt-4 text-center">
              <Button variant="outline" size="sm" onClick={() => void loadOlder()}>
                Load older
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
