import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

export const scamalytics: DiagnosticProvider = {
  name: "scamalytics",
  category: "ip_quality",
  settingKey: "scamalytics_key",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(
      `https://api11.scamalytics.com/${apiKey}/?ip=${params.ip}`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!res.ok) throw new Error(`Scamalytics API returned ${res.status}`);

    const json = await res.json() as Record<string, unknown>;

    return {
      provider: "scamalytics",
      category: "ip_quality",
      skipped: false,
      data: {
        score: Number(json.score) || 0,
        risk: json.risk,
        vpn: json["Anonymizing VPN"] === "Yes",
        tor: json["Tor Exit Node"] === "Yes",
        proxy: json["Public Proxy"] === "Yes",
      },
      duration_ms: 0,
    };
  },
};

registerProvider(scamalytics);
