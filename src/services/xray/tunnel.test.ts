import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { needsTunnel, closeTunnel, closeAllTunnels } from "./tunnel";
import type { Node } from "../../db/schema";

function makeNode(overrides: Partial<Node> = {}): Node {
  return {
    id: "node-1",
    name: "test-trojan",
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

afterEach(() => {
  closeAllTunnels();
});

describe("needsTunnel", () => {
  test("returns true when ssh_alias is set", () => {
    expect(needsTunnel(makeNode({ ssh_alias: "yinnet" }))).toBe(true);
  });

  test("returns true when ssh_user is set", () => {
    expect(needsTunnel(makeNode({ ssh_user: "root" }))).toBe(true);
  });

  test("returns true when both ssh_alias and ssh_user are set", () => {
    expect(needsTunnel(makeNode({ ssh_alias: "yinnet", ssh_user: "root" }))).toBe(true);
  });

  test("returns false when neither ssh_alias nor ssh_user is set", () => {
    expect(needsTunnel(makeNode())).toBe(false);
  });
});

describe("closeTunnel", () => {
  test("no-op when tunnel does not exist", () => {
    // Should not throw
    closeTunnel("nonexistent-id");
  });
});

describe("closeAllTunnels", () => {
  test("no-op when no tunnels exist", () => {
    // Should not throw
    closeAllTunnels();
  });
});
