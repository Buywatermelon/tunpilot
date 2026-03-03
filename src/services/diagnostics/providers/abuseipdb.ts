import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

export const abuseipdb: DiagnosticProvider = {
  name: "abuseipdb",
  category: "ip_quality",
  settingKey: "abuseipdb_key",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${params.ip}&maxAgeInDays=90`,
      {
        headers: { Key: apiKey!, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!res.ok) throw new Error(`AbuseIPDB API returned ${res.status}`);

    const json = await res.json() as { data: Record<string, unknown> };
    const d = json.data;

    return {
      provider: "abuseipdb",
      category: "ip_quality",
      skipped: false,
      data: {
        abuse_confidence: d.abuseConfidenceScore,
        total_reports: d.totalReports,
        last_reported: d.lastReportedAt,
        usage_type: d.usageType,
        isp: d.isp,
        country: d.countryCode,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(abuseipdb);
