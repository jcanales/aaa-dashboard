function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function securityConfig() {
  return {
    apiPerMin: num('CONVERTER_RATE_LIMIT_API_PER_MIN', 240),
    accessLogRetentionMs: num('CONVERTER_ACCESS_LOG_RETENTION_DAYS', 90) * 24 * 60 * 60_000,
    anomalyWindowMs: num('CONVERTER_ANOMALY_WINDOW_MIN', 5) * 60_000,
    anomalyThreshold: num('CONVERTER_ANOMALY_READ_THRESHOLD', 120),
    anomalyCooldownMs: num('CONVERTER_ANOMALY_COOLDOWN_MIN', 60) * 60_000,
  };
}

export function rateLimitEnabled(): boolean {
  return process.env.NODE_ENV !== 'test';
}
