export interface DelayMeasurement {
  Average: string;
  [sample: string]: string;
}

export interface NetQualityResult {
  Head: {
    IP: string;
    Command: string;
    GitHub: string;
    Time: string;
    Version: string;
    [key: string]: unknown;
  };
  BGP: {
    ASN: string;
    Organization: string;
    Prefix: string;
    RIR: string;
    RegDate: string;
    ModDate: string;
    Country: string;
    IntermediateRegion: string;
    SubRegion: string;
    Region: string;
    Address: string;
    GeoFeed: string;
    IPinTotal: string;
    IPActive: string;
    NeighborinTotal: string;
    NeighborActive: string;
    IXCount: string;
    UpstreamsCount: string;
    PeersCount: string;
    [key: string]: unknown;
  };
  Local: {
    NAT: string;
    NATDescribe: string;
    Mapping: string;
    Filter: string;
    Port: string;
    Hairpin: string;
    TCPCongestionControl: string;
    QueueDiscipline: string;
    TCPReceiveBuffer: string;
    TCPSendBuffer: string;
    [key: string]: unknown;
  };
  Connectivity: Array<{
    ID: string;
    ASN: string;
    Org: string;
    IsTarget: boolean;
    IsTier1: boolean;
    IsUpstream: boolean;
  }>;
  Delay: Array<{
    Code: string;
    Name: string;
    CT: DelayMeasurement;
    CU: DelayMeasurement;
    CM: DelayMeasurement;
  }>;
  Speedtest: Array<{
    City: string;
    Provider: string;
    ID: string;
    SendSpeed: string;
    SendDelay: string;
    ReceiveSpeed: string;
    ReceiveDelay: string;
  }>;
  Transfer: Array<{
    City: string;
    SendSpeed: string;
    SendRetransmits: string;
    ReceiveSpeed: string;
    ReceiveRetransmits: string;
    Delay: DelayMeasurement;
  }>;
}

export type NetQualityMode = "full" | "ping" | "low";

const MODE_CONFIG: Record<NetQualityMode, { flags: string; timeout: number }> = {
  full: { flags: "-j -4 -y", timeout: 600_000 },
  ping: { flags: "-j -4 -y -P", timeout: 120_000 },
  low: { flags: "-j -4 -y -L", timeout: 300_000 },
};

export async function runNetQuality(
  host: string,
  sshUser: string,
  sshPort: number = 22,
  mode: NetQualityMode = "full",
): Promise<NetQualityResult> {
  const { flags, timeout: timeoutMs } = MODE_CONFIG[mode];

  const proc = Bun.spawn(
    ["ssh", "-p", String(sshPort), "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new", `${sshUser}@${host}`, `bash <(curl -sL Net.Check.Place) ${flags}`],
    { stdout: "pipe", stderr: "pipe" },
  );

  const timeout = setTimeout(() => proc.kill(), timeoutMs);

  try {
    const exitCode = await proc.exited;
    clearTimeout(timeout);

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      throw new Error(`SSH command failed (exit ${exitCode}): ${stderr.slice(0, 500)}`);
    }

    // The script may output progress text before JSON — find the JSON object
    const jsonStart = stdout.indexOf("{");
    if (jsonStart === -1) {
      throw new Error(`No JSON found in output: ${stdout.slice(0, 500)}`);
    }

    const jsonStr = stdout.slice(jsonStart);
    return JSON.parse(jsonStr) as NetQualityResult;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse NetQuality JSON output: ${err.message}`);
    }
    throw err;
  }
}
