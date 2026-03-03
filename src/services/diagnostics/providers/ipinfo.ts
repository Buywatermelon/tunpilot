import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

function parseOrg(org: string | undefined): { asn: string; isp: string } {
  if (!org) return { asn: "", isp: "" };
  const match = org.match(/^(AS\d+)\s+(.+)$/);
  return match ? { asn: match[1]!, isp: match[2]! } : { asn: "", isp: org };
}

export const ipinfo: DiagnosticProvider = {
  name: "ipinfo",
  category: "ip_info",
  settingKey: "ipinfo_token",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const res = await fetch(`https://ipinfo.io/${params.ip}?token=${apiKey}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`IPinfo API returned ${res.status}`);
    }

    const json = await res.json() as Record<string, unknown>;
    const { asn, isp } = parseOrg(json.org as string | undefined);
    const privacy = json.privacy as Record<string, boolean> | undefined;

    return {
      provider: "ipinfo",
      category: "ip_info",
      skipped: false,
      data: {
        ip: json.ip,
        city: json.city,
        region: json.region,
        country: json.country,
        loc: json.loc,
        asn,
        isp,
        timezone: json.timezone,
        privacy: privacy ?? {},
      },
      duration_ms: 0,
    };
  },
};

registerProvider(ipinfo);
