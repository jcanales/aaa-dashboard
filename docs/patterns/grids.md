# Paginated grid pattern

Use this for any table that lists rows out of a larger result set (HTS codes,
entries, crossings, line items, etc). It gives you: no page-level scroll from
a long table, a sticky header (and sticky total row, if you have one), and a
"Rows per page" selector with Prev/Next — matching what's already live on
`/duties/hts`, `/duties/hts/:bucket`, `/dashboard`'s Entries grid, and
`/entries/:recid`'s Line Items.

Real examples to copy from: `src/pages/DutiesBreakdownPage.tsx`,
`src/pages/DutyBucketDetailPage.tsx`, `src/pages/AbiCrossingsPage.tsx`,
`src/pages/DashboardPage.tsx` (Entries grid), `src/pages/EntryDetailPage.tsx`
(Line Items — sticky footer only, no pagination, since a single entry's line
count is always bounded).

## 1. State

```tsx
const [page, setPage] = useState(1)
const [pageSize, setPageSize] = useState(25)

// server-paginated: refetch page 1 with the new limit
function changePageSize(size: number) {
  setPageSize(size)
  loadPage(1, size)
}

// client-paginated (you already have the full filtered/sorted array):
function changePageSize(size: number) {
  setPageSize(size)
  setPage(1)
}
```

Default is always **25**, options are always **[25, 50, 75, 100]**. Reset
`page` to 1 whenever the client/date filter, search box, or sort changes —
anything that can shrink the result set out from under the current page.

## 2. Markup skeleton

```tsx
<div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
    <h2 className="text-sm font-semibold text-slate-700">Grid title</h2>
    <span className="text-xs text-slate-400">{total.toLocaleString()} records</span>
  </div>

  {/* scrolls internally — this is what stops the whole page from growing */}
  <div className="overflow-auto max-h-[640px]">
    <table className="w-full text-xs sticky-table">
      <thead>
        <tr className="text-slate-500 border-b border-slate-100">
          <th className="text-left px-4 py-2.5 font-medium">Col</th>
        </tr>
      </thead>
      <tbody>
        {/* rows */}
      </tbody>
      {/* optional — only if the grid has a totals row */}
      <tfoot className="border-t-2 border-slate-200 bg-slate-50">
        <tr>
          <td className="px-4 py-2.5 font-bold text-slate-700">Total</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400">Rows per page</span>
      <select
        value={pageSize}
        onChange={(e) => changePageSize(Number(e.target.value))}
        className="text-xs border border-slate-200 rounded px-2 py-1 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-200"
      >
        {[25, 50, 75, 100].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400">Page {page} of {totalPages || 1}</span>
      <div className="flex gap-1">
        <button
          onClick={() => loadPage(page - 1)}
          disabled={page === 1}
          className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >
          Prev
        </button>
        <button
          onClick={() => loadPage(page + 1)}
          disabled={page >= totalPages}
          className="px-2.5 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</div>
```

Keep the "Rows per page" bar **always rendered**, not gated behind
`totalPages > 1` — the selector needs to be there even on a one-page result
so the user can widen it.

## 3. The `sticky-table` CSS class (`src/index.css`)

`sticky-table` already exists and does three things:

1. Overrides Tailwind preflight's `border-collapse: collapse` back to
   `separate` — without this, `position: sticky` on `<th>`/`<td>` silently
   breaks in a way that's easy to miss until you have a page tall enough to
   actually scroll (this bit us once already — see git history around
   2026-09-18).
2. Pins the table's own `<thead>` to `top: 0`.
3. Pins the table's own `<tfoot>` to `bottom: 0`, if present.

Both pinning rules use **child combinators** (`.sticky-table > thead > tr >
th`, not `.sticky-table > tfoot > tr > td`), not descendant selectors —
deliberately. Several of these grids nest a second `<table>` inside an
expanded drill-down `<td>` (its own dark `#093B49` header row). A descendant
selector would reach into that nested table too and stomp its background —
that's exactly the bug we hit and fixed. **Do not add the `sticky-table`
class to a nested/inner drill-down table** — only the outer grid table
should carry it.

## 4. Checklist for a new grid

- [ ] `pageSize` state, default `25`; selector with `[25, 50, 75, 100]`
- [ ] `page` resets to 1 on filter/search/sort change and on page-size change
- [ ] Outer scroll wrapper is `overflow-auto max-h-[640px]` (or similar —
      match whatever fits the surrounding page), not `overflow-x-auto`
- [ ] `<table>` has the `sticky-table` class
- [ ] Inner/nested drill-down tables do **not** have `sticky-table`
- [ ] "Rows per page" + Prev/Next bar is always rendered, not conditional
