import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

export const ipqs: DiagnosticProvider = {
  name: "ipqs",
  category: "ip_quality",
  settingKey: "ipqs_key",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${apiKey}/${params.ip}?strictness=1&allow_public_access_points=true`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) throw new Error(`IPQS API returned ${res.status}`);

    const json = await res.json() as Record<string, unknown>;
    if (!json.success) throw new Error(`IPQS error: ${json.message}`);

    return {
      provider: "ipqs",
      category: "ip_quality",
      skipped: false,
      data: {
        fraud_score: json.fraud_score,
        vpn: json.vpn,
        proxy: json.proxy,
        tor: json.tor,
        bot: json.bot_status,
        recent_abuse: json.recent_abuse,
        isp: json.ISP,
        connection_type: json.connection_type,
        country: json.country_code,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(ipqs);
