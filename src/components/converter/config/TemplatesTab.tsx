import { Code2 } from 'lucide-react'
import { useParserTemplates } from '@/hooks/converter/useParserTemplates'

export function TemplatesTab() {
  const { templates, isLoading, error, setEnabled } = useParserTemplates()

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Deterministic parsers</p>
        <p className="text-xs text-slate-400">
          Code-defined parsers for known invoice formats. Disable one to route its invoices to the AI extractor instead.
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      {isLoading ? (
        <div className="px-5 py-10 text-center text-xs text-slate-400">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12">
          <Code2 className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-xs text-slate-400">No parser templates registered.</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
              <th className="px-4 py-2">Name</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2 text-right">Invoices parsed</th>
              <th className="px-3 py-2 text-center">Enabled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {templates.map((t) => (
              <tr key={t.id} className={t.enabled ? '' : 'opacity-60'}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{t.name}</td>
                <td className="px-3 py-2.5 text-slate-500">{t.description}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{t.conversionCount}</td>
                <td className="px-3 py-2.5 text-center">
                  <button
                    role="switch"
                    aria-checked={t.enabled}
                    aria-label={`${t.enabled ? 'Disable' : 'Enable'} ${t.name}`}
                    onClick={() => setEnabled(t.id, !t.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      t.enabled ? 'bg-teal-800' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        t.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
