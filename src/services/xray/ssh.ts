import type { Node } from "../../db/schema";

const SSH_CONNECT_TIMEOUT = 10; // seconds
const SSH_COMMAND_TIMEOUT = 30_000; // ms

export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Get SSH connection args for a node. Prefer ssh_alias when configured. */
export function sshArgs(node: Node): string[] {
  const args = [
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", `ConnectTimeout=${SSH_CONNECT_TIMEOUT}`,
  ];

  if (node.ssh_alias) {
    return [...args, node.ssh_alias];
  }

  const user = node.ssh_user || "root";
  const port = node.ssh_port ?? 22;
  return [
    ...args,
    "-p", String(port),
    `${user}@${node.host}`,
  ];
}

/** Race a promise against a timeout; kill the subprocess on timeout. */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  proc: { kill(): void },
  label: string,
): Promise<T> {
  let timer: Timer;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Execute a command on a node via SSH and return stdout. */
export async function sshExec(node: Node, command: string): Promise<string> {
  const proc = Bun.spawn(["ssh", ...sshArgs(node), command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const work = Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const [exitCode, stdout, stderr] = await withTimeout(
    work,
    SSH_COMMAND_TIMEOUT,
    proc,
    `SSH exec on ${node.name}`,
  );

  if (exitCode !== 0) {
    throw new Error(`SSH command failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return stdout;
}

/** Write content to a file on a node via SSH (stdin pipe). */
export async function sshWriteFile(node: Node, path: string, content: string): Promise<void> {
  const proc = Bun.spawn(
    ["ssh", ...sshArgs(node), `cat > ${shellQuote(path)}`],
    { stdin: Buffer.from(content), stdout: "pipe", stderr: "pipe" },
  );

  const work = Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);

  const [exitCode, stderr] = await withTimeout(
    work,
    SSH_COMMAND_TIMEOUT,
    proc,
    `SSH write on ${node.name}`,
  );

  if (exitCode !== 0) {
    throw new Error(`SSH write failed (exit ${exitCode}): ${stderr.trim()}`);
  }
}
