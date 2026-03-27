import { test, expect, describe } from "bun:test";
import type { Node } from "../../db/schema";
import { sshArgs } from "./ssh";

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "node-1",
    name: "test-node",
    host: "203.0.113.1",
    port: 443,
    protocol: "trojan",
    stats_port: 10085,
    stats_secret: null,
    sni: null,
    cert_path: null,
    cert_expires: null,
    hy2_version: null,
    config_path: null,
    ssh_user: null,
    ssh_port: 22,
    ssh_alias: null,
    cert_fingerprint: null,
    insecure: 0,
    enabled: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("sshArgs", () => {
  test("优先使用 ssh_alias 而不是 user@host", () => {
    const args = sshArgs(makeNode({ ssh_alias: "voyra", ssh_user: "root", ssh_port: 2222 }));
    expect(args).toContain("voyra");
    expect(args).not.toContain("root@203.0.113.1");
    expect(args).not.toContain("2222");
  });

  test("无 alias 时回退到 user@host", () => {
    const args = sshArgs(makeNode({ ssh_user: "admin", ssh_port: 2222 }));
    expect(args).toContain("admin@203.0.113.1");
    expect(args).toContain("2222");
  });
});
