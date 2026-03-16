import type { Node } from "../../db/schema";
import type { Subprocess } from "bun";

interface Tunnel {
  localPort: number;
  process: Subprocess;
}

const tunnels = new Map<string, Tunnel>();

/** Check if a node requires an SSH tunnel for gRPC access. */
export function needsTunnel(node: Node): boolean {
  return !!(node.ssh_alias || node.ssh_user);
}

/** Get the SSH target string for a node. */
function sshTarget(node: Node): string {
  if (node.ssh_alias) return node.ssh_alias;
  const port = node.ssh_port ?? 22;
  return port === 22
    ? `${node.ssh_user}@${node.host}`
    : `-p ${port} ${node.ssh_user}@${node.host}`;
}

/** Find a free local port by briefly listening on port 0. */
async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    });
    const port = server.port;
    server.stop();
    resolve(port);
  });
}

/** Wait until a local TCP port is accepting connections. */
async function waitForPort(port: number, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const socket = await Bun.connect({
        hostname: "127.0.0.1",
        port,
        socket: {
          data() {},
          open(socket) { socket.end(); },
          close() {},
          error() {},
        },
      });
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`SSH tunnel port ${port} not ready after ${timeoutMs}ms`);
}

/**
 * Ensure an SSH tunnel exists for the given node.
 * Returns the local port to connect gRPC to.
 */
export async function ensureTunnel(node: Node): Promise<number> {
  const existing = tunnels.get(node.id);
  if (existing) return existing.localPort;

  const localPort = await findFreePort();
  const target = sshTarget(node);
  const remotePort = node.stats_port!;

  const args = [
    "ssh", "-N",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=3",
    "-o", "StrictHostKeyChecking=accept-new",
    "-L", `${localPort}:127.0.0.1:${remotePort}`,
    ...target.split(" "),
  ];

  const proc = Bun.spawn(args, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  const tunnel: Tunnel = { localPort, process: proc };
  tunnels.set(node.id, tunnel);

  // Auto-cleanup on process exit
  proc.exited.then((code) => {
    tunnels.delete(node.id);
    if (code !== 0) {
      // Read stderr for diagnostics
      new Response(proc.stderr).text().then((stderr) => {
        console.error(`SSH tunnel for ${node.name} exited (code ${code}): ${stderr.trim()}`);
      });
    }
  });

  try {
    await waitForPort(localPort);
  } catch (err) {
    proc.kill();
    tunnels.delete(node.id);
    throw err;
  }

  return localPort;
}

/** Close a specific tunnel. */
export function closeTunnel(nodeId: string): void {
  const tunnel = tunnels.get(nodeId);
  if (tunnel) {
    tunnel.process.kill();
    tunnels.delete(nodeId);
  }
}

/** Close all tunnels. Called on graceful shutdown. */
export function closeAllTunnels(): void {
  for (const tunnel of tunnels.values()) {
    tunnel.process.kill();
  }
  tunnels.clear();
}
