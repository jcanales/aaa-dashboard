import { prisma } from '../../db';

// USD per 1M tokens, Anthropic first-party API rates (in/out). Extraction only ever
// uses these two models (extractionService.ts) — an unrecognized value here means
// a model was added there without updating this table, not a data error.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-opus-5': { in: 5, out: 25 },
};

// null tokens = row predates token tracking (unknowable, not zero). null model with
// tracked (zero) tokens = the deterministic template parser handled it, a genuine $0.
export function estimateCostUsd(model: string | null, tokensIn: number | null, tokensOut: number | null): number | null {
  if (tokensIn == null || tokensOut == null) return null;
  if (!model) return 0;
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (tokensIn / 1_000_000) * pricing.in + (tokensOut / 1_000_000) * pricing.out;
}

export interface LogFilters {
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export interface LogRow {
  id: string;
  pdfFilename: string;
  status: string;
  extractionError: string | null;
  parseSource: string | null;
  extractionModel: string | null;
  extractionDurationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  estimatedCostUsd: number | null;
  createdAt: Date;
}

export interface LogStats {
  totalDocuments: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalEstimatedCostUsd: number;
}

export async function listConversionLogs(filters: LogFilters): Promise<{ rows: LogRow[]; total: number; stats: LogStats }> {
  const page = Math.max(Math.trunc(filters.page), 1);
  const pageSize = Math.min(Math.max(Math.trunc(filters.pageSize), 1), 200);

  const where = {
    ...(filters.from || filters.to
      ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };

  const [total, rows, grouped] = await Promise.all([
    prisma.conversion.count({ where }),
    prisma.conversion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        pdfFilename: true,
        status: true,
        extractionError: true,
        parseSource: true,
        extractionModel: true,
        extractionDurationMs: true,
        tokensIn: true,
        tokensOut: true,
        createdAt: true,
      },
    }),
    // Aggregated over the full filtered set (not just the current page) — grouped by
    // model so Postgres does the summing; at most 3 groups (null/sonnet/opus) come back
    // regardless of table size.
    prisma.conversion.groupBy({
      by: ['extractionModel'],
      where,
      _count: { _all: true },
      _sum: { tokensIn: true, tokensOut: true },
    }),
  ]);

  const stats = grouped.reduce<LogStats>(
    (acc, g) => ({
      totalDocuments: acc.totalDocuments + g._count._all,
      totalTokensIn: acc.totalTokensIn + (g._sum.tokensIn ?? 0),
      totalTokensOut: acc.totalTokensOut + (g._sum.tokensOut ?? 0),
      totalEstimatedCostUsd: acc.totalEstimatedCostUsd + (estimateCostUsd(g.extractionModel, g._sum.tokensIn, g._sum.tokensOut) ?? 0),
    }),
    { totalDocuments: 0, totalTokensIn: 0, totalTokensOut: 0, totalEstimatedCostUsd: 0 }
  );

  return {
    rows: rows.map((r) => ({ ...r, estimatedCostUsd: estimateCostUsd(r.extractionModel, r.tokensIn, r.tokensOut) })),
    total,
    stats,
  };
}
