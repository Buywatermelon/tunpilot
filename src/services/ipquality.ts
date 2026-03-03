export interface IPQualityResult {
  Head: {
    IP: string;
    Time: string;
    Version: string;
    [key: string]: unknown;
  };
  Info: {
    ASN: string;
    Organization: string;
    City: { Name: string; Subdivisions: string };
    Region: { Code: string; Name: string };
    Continent: { Code: string; Name: string };
    TimeZone: string;
    [key: string]: unknown;
  };
  Type: {
    Usage: Record<string, string>;
    Company: Record<string, string>;
  };
  Score: Record<string, string>;
  Factor: Record<string, Record<string, boolean | string | null>>;
  Media: Record<string, { Status: string; Region: string; Type: string }>;
  Mail: {
    Port25: boolean;
    DNSBlacklist: { Total: number; Clean: number; Marked: number; Blacklisted: number };
    [key: string]: unknown;
  };
}

export async function runIPQuality(
  host: string,
  sshUser: string,
  sshPort: number = 22,
): Promise<IPQualityResult> {
  const proc = Bun.spawn(
    ["ssh", "-p", String(sshPort), "-o", "ConnectTimeout=10", `${sshUser}@${host}`, "bash <(curl -sL IP.Check.Place) -j -4"],
    { stdout: "pipe", stderr: "pipe" },
  );

  const timeout = setTimeout(() => proc.kill(), 120_000);

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
    return JSON.parse(jsonStr) as IPQualityResult;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof SyntaxError) {
      throw new Error(`Failed to parse IPQuality JSON output: ${err.message}`);
    }
    throw err;
  }
}
