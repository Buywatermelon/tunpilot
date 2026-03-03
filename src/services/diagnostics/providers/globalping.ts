import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

async function pollMeasurement(id: string, apiKey: string, timeoutMs: number = 30000): Promise<Record<string, unknown>> {
  const start = Date.now();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  while (Date.now() - start < timeoutMs) {
    const res = await fetch(`https://api.globalping.io/v1/measurements/${id}`, { headers });
    if (!res.ok) throw new Error(`Globalping poll returned ${res.status}`);
    const json = await res.json() as Record<string, unknown>;
    if (json.status === "finished") return json;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Globalping measurement timed out");
}

function parseLocation(target: string): { country?: string; city?: string } {
  // Parse "Beijing, CN" or "Tokyo, JP" format
  const parts = target.split(",").map(s => s.trim());
  if (parts.length === 2) return { city: parts[0], country: parts[1] };
  if (parts.length === 1) return { country: parts[0] };
  return {};
}

export const globalping: DiagnosticProvider = {
  name: "globalping",
  category: "route",
  settingKey: "globalping_token",

  async run(params: DiagnosticParams, apiKey?: string): Promise<DiagnosticResult> {
    const target = params.target || "Beijing, CN";
    const location = parseLocation(target);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    // Create measurement
    const createRes = await fetch("https://api.globalping.io/v1/measurements", {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: "ping",
        target: params.ip,
        locations: [{ country: location.country, city: location.city }],
        measurementOptions: { packets: 5 },
        limit: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!createRes.ok) {
      const body = await createRes.text();
      throw new Error(`Globalping create returned ${createRes.status}: ${body}`);
    }

    const { id } = await createRes.json() as { id: string };
    const measurement = await pollMeasurement(id, apiKey || "");

    const results = measurement.results as Array<{
      result: { stats: Record<string, number> };
      probe: Record<string, unknown>;
    }>;

    if (!results || results.length === 0) {
      throw new Error("No results from Globalping");
    }

    const first = results[0]!;
    const stats = first.result.stats;

    return {
      provider: "globalping",
      category: "route",
      skipped: false,
      data: {
        from: target,
        probe_location: `${first.probe.city}, ${first.probe.country}`,
        probe_network: first.probe.network,
        probe_asn: first.probe.asn,
        latency_min: stats.min,
        latency_avg: stats.avg,
        latency_max: stats.max,
        packet_loss: stats.loss ?? stats.drop ?? 0,
        packets_received: stats.rcv,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(globalping);
