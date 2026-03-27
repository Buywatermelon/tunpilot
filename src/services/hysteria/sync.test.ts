import { test, expect, beforeEach, afterEach, describe, spyOn } from "bun:test";
import { initDatabase, type Db } from "../../db/index";
import { addNode } from "../node";
import { createUser, assignNodesToUser } from "../user";
import type { Node, User } from "../../db/schema";
import * as sshModule from "../xray/ssh";
import {
  syncUserToHysteriaNodes,
  syncHysteriaNodes,
  reconcileAllHysteriaNodes,
} from "./sync";

let db: Db;

const mockSshExec = spyOn(sshModule, "sshExec");
const mockSshWriteFile = spyOn(sshModule, "sshWriteFile");

function makeConfig(overrides: Partial<{ auth: string[]; trafficStats: string[] }> = {}) {
  return [
    "listen: :443",
    "tls:",
    "  cert: /etc/ssl/cert.pem",
    "  key: /etc/ssl/key.pem",
    ...(overrides.auth ?? [
      "auth:",
      "  type: http",
      "  http:",
      "    url: http://127.0.0.1:33333/auth/node/secret",
    ]),
    ...(overrides.trafficStats ?? [
      "trafficStats:",
      "  listen: :9091",
      "  secret: old-secret",
    ]),
    "",
  ].join("\n");
}

beforeEach(() => {
  db = initDatabase(":memory:");
  mockSshExec.mockReset();
  mockSshWriteFile.mockReset();
  mockSshExec.mockImplementation(async (_node: Node, cmd: string) => {
    if (cmd.startsWith("cat ")) return makeConfig();
    return "";
  });
  mockSshWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  db?.$client?.close();
});

function createHy2Node(name: string = "hy2-us", overrides: Partial<Parameters<typeof addNode>[1]> = {}): Node {
  return addNode(db, {
    name,
    host: "203.0.113.2",
    port: 443,
    protocol: "hysteria2",
    stats_port: 9999,
    stats_secret: "stats-secret",
    ssh_alias: "voyra",
    config_path: "/etc/hysteria/config.yaml",
    ...overrides,
  });
}

function createTestUser(name: string = "alice"): User {
  return createUser(db, { name, password: `pass-${name}` });
}

describe("syncUserToHysteriaNodes", () => {
  test("为活跃用户部署 userpass 和本地 stats 配置", async () => {
    const node = createHy2Node();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await syncUserToHysteriaNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).toHaveBeenCalled();
    const written = mockSshWriteFile.mock.calls[0]![2] as string;
    expect(written).toContain("type: userpass");
    expect(written).toContain("alice: pass-alice");
    expect(written).toContain("listen: 127.0.0.1:9999");
    expect(written).toContain("secret: stats-secret");
  });

  test("配置已符合预期时跳过写入", async () => {
    const node = createHy2Node();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    mockSshExec.mockImplementation(async (_node: Node, cmd: string) => {
      if (cmd.startsWith("cat ")) {
        return [
          "listen: :443",
          "auth:",
          "  type: userpass",
          "  userpass:",
          "    alice: pass-alice",
          "trafficStats:",
          "  listen: 127.0.0.1:9999",
          "  secret: stats-secret",
          "",
        ].join("\n");
      }
      return "";
    });

    const errors = await syncUserToHysteriaNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).not.toHaveBeenCalled();
  });
});

describe("syncHysteriaNodes", () => {
  test("忽略非 Hysteria2 节点", async () => {
    const node = addNode(db, {
      name: "trojan-us",
      host: "203.0.113.3",
      port: 443,
      protocol: "trojan",
      stats_port: 10085,
      ssh_user: "root",
    });

    const errors = await syncHysteriaNodes(db, [node.id]);

    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).not.toHaveBeenCalled();
  });
});

describe("reconcileAllHysteriaNodes", () => {
  test("对所有 Hysteria2 节点做全量对账", async () => {
    const node = createHy2Node();
    const user1 = createTestUser("alice");
    const user2 = createTestUser("bob");
    assignNodesToUser(db, user1.id, [node.id]);
    assignNodesToUser(db, user2.id, [node.id]);

    const results = await reconcileAllHysteriaNodes(db);

    expect(results).toHaveLength(1);
    expect(results[0]!.nodeName).toBe("hy2-us");
    expect(results[0]!.added).toBe(2);
    expect(results[0]!.errors).toHaveLength(0);
  });

  test("无 SSH 配置的 Hysteria2 节点报错", async () => {
    addNode(db, {
      name: "no-ssh",
      host: "203.0.113.4",
      port: 443,
      protocol: "hysteria2",
      stats_port: 9999,
      stats_secret: "stats-secret",
    });

    const results = await reconcileAllHysteriaNodes(db);

    expect(results).toHaveLength(1);
    expect(results[0]!.errors[0]).toContain("no SSH config");
  });
});
