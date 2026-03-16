import type { Node } from "../../db/schema";

/** Get SSH connection args for a node (explicit host/port, no aliases). */
export function sshArgs(node: Node): string[] {
  const user = node.ssh_user || "root";
  const port = node.ssh_port ?? 22;
  return [
    "-o", "StrictHostKeyChecking=accept-new",
    "-p", String(port),
    `${user}@${node.host}`,
  ];
}

/** Execute a command on a node via SSH and return stdout. */
export async function sshExec(node: Node, command: string): Promise<string> {
  const proc = Bun.spawn(["ssh", ...sshArgs(node), command], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`SSH command failed (exit ${exitCode}): ${stderr.trim()}`);
  }
  return stdout;
}

/** Write content to a file on a node via SSH (stdin pipe). */
export async function sshWriteFile(node: Node, path: string, content: string): Promise<void> {
  const proc = Bun.spawn(
    ["ssh", ...sshArgs(node), `cat > ${path}`],
    { stdin: Buffer.from(content), stdout: "pipe", stderr: "pipe" }
  );
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`SSH write failed (exit ${exitCode}): ${stderr.trim()}`);
  }
}
