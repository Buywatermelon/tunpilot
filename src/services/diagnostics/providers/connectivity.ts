import { registerProvider, type DiagnosticProvider, type DiagnosticParams, type DiagnosticResult } from "../index";

async function tcpHandshake(host: string, port: number, timeoutMs: number): Promise<{ reachable: boolean; latency_ms: number }> {
  const start = performance.now();
  try {
    const socket = await Bun.connect({
      hostname: host,
      port,
      socket: {
        data() {},
        open(socket) { socket.end(); },
        error() {},
        close() {},
      },
    });
    const latency = Math.round(performance.now() - start);
    return { reachable: true, latency_ms: latency };
  } catch {
    return { reachable: false, latency_ms: Math.round(performance.now() - start) };
  }
}

export const connectivity: DiagnosticProvider = {
  name: "connectivity",
  category: "connectivity",
  settingKey: null,

  async run(params: DiagnosticParams): Promise<DiagnosticResult> {
    const port = params.port || 443;
    const result = await tcpHandshake(params.ip, port, 5000);

    return {
      provider: "connectivity",
      category: "connectivity",
      skipped: false,
      data: {
        host: params.ip,
        port,
        reachable: result.reachable,
        handshake_ms: result.latency_ms,
      },
      duration_ms: 0,
    };
  },
};

registerProvider(connectivity);
