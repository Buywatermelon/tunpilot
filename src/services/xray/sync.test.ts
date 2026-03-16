import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from "bun:test";
import { initDatabase, type Db } from "../../db/index";
import { addNode } from "../node";
import { createUser, assignNodesToUser } from "../user";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Node, User } from "../../db/schema";
import * as sshModule from "./ssh";
import {
  syncUserToXrayNodes,
  syncTrojanNodes,
  reconcileAllXrayNodes,
} from "./sync";

let db: Db;

// Mock SSH operations — sshExec and sshWriteFile
const mockSshExec = spyOn(sshModule, "sshExec");
const mockSshWriteFile = spyOn(sshModule, "sshWriteFile");

// Base Xray config returned by sshExec when reading config file
function makeXrayConfig(clients: any[] = []) {
  return JSON.stringify({
    log: { loglevel: "warning" },
    inbounds: [{
      tag: "trojan-in",
      port: 443,
      protocol: "trojan",
      settings: { clients },
    }],
    outbounds: [{ tag: "direct", protocol: "freedom" }],
  });
}

beforeEach(() => {
  db = initDatabase(":memory:");
  mockSshExec.mockReset();
  mockSshWriteFile.mockReset();

  // Default: sshExec returns empty config for "cat" and succeeds for "systemctl restart"
  mockSshExec.mockImplementation(async (_node: Node, cmd: string) => {
    if (cmd.startsWith("cat ")) return makeXrayConfig();
    if (cmd.startsWith("systemctl")) return "";
    return "";
  });
  mockSshWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  db?.$client?.close();
});

function createTrojanNode(name: string = "trojan-us"): Node {
  return addNode(db, {
    name,
    host: "203.0.113.1",
    port: 443,
    protocol: "trojan",
    stats_port: 10085,
    ssh_user: "root",
  });
}

function createHy2Node(name: string = "hy2-us"): Node {
  return addNode(db, {
    name,
    host: "203.0.113.2",
    port: 443,
    protocol: "hysteria2",
    stats_port: 9090,
    stats_secret: "secret",
  });
}

function createTestUser(name: string = "testuser"): User {
  return createUser(db, { name, password: `pass-${name}` });
}

describe("syncUserToXrayNodes", () => {
  test("为活跃用户部署配置到 Trojan 节点", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    // Should write config with the user's password
    expect(mockSshWriteFile).toHaveBeenCalled();
    const writtenConfig = JSON.parse(mockSshWriteFile.mock.calls[0]![2] as string);
    const clients = writtenConfig.inbounds[0].settings.clients;
    expect(clients).toHaveLength(1);
    expect(clients[0].email).toBe(user.name);
    expect(clients[0].password).toBe(user.password);
    // Should restart xray
    expect(mockSshExec).toHaveBeenCalledWith(expect.anything(), "systemctl restart xray");
  });

  test("不对 Hysteria2 节点进行操作", async () => {
    const node = createHy2Node();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).not.toHaveBeenCalled();
  });

  test("为禁用用户部署空客户端列表", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    db.update(users).set({ enabled: 0 }).where(eq(users.id, user.id)).run();

    // Config currently has the user, so deploying should remove them
    mockSshExec.mockImplementation(async (_node: Node, cmd: string) => {
      if (cmd.startsWith("cat ")) return makeXrayConfig([{ password: user.password, email: user.name, level: 0 }]);
      return "";
    });

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    const writtenConfig = JSON.parse(mockSshWriteFile.mock.calls[0]![2] as string);
    expect(writtenConfig.inbounds[0].settings.clients).toHaveLength(0);
  });

  test("用户不存在时返回空错误列表", async () => {
    const errors = await syncUserToXrayNodes(db, "nonexistent-id");
    expect(errors).toHaveLength(0);
  });

  test("配置未变化时跳过重启", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    // Config already has this user
    mockSshExec.mockImplementation(async (_node: Node, cmd: string) => {
      if (cmd.startsWith("cat ")) return makeXrayConfig([{ password: user.password, email: user.name, level: 0 }]);
      return "";
    });

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).not.toHaveBeenCalled(); // No write needed
  });
});

describe("syncTrojanNodes", () => {
  test("部署配置到指定 Trojan 节点", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await syncTrojanNodes(db, [node.id]);

    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).toHaveBeenCalled();
  });

  test("忽略非 Trojan 节点", async () => {
    const node = createHy2Node();
    const errors = await syncTrojanNodes(db, [node.id]);
    expect(errors).toHaveLength(0);
    expect(mockSshWriteFile).not.toHaveBeenCalled();
  });
});

describe("reconcileAllXrayNodes", () => {
  test("对所有 Trojan 节点做全量对账", async () => {
    const node = createTrojanNode();
    const user1 = createTestUser("user1");
    const user2 = createTestUser("user2");
    assignNodesToUser(db, user1.id, [node.id]);
    assignNodesToUser(db, user2.id, [node.id]);

    const results = await reconcileAllXrayNodes(db);

    expect(results).toHaveLength(1);
    expect(results[0]!.nodeName).toBe("trojan-us");
    expect(results[0]!.added).toBe(2);
    expect(results[0]!.errors).toHaveLength(0);
  });

  test("没有 Trojan 节点时返回空结果", async () => {
    createHy2Node();
    const results = await reconcileAllXrayNodes(db);
    expect(results).toHaveLength(0);
  });

  test("无 SSH 配置的 Trojan 节点报错", async () => {
    addNode(db, {
      name: "no-ssh",
      host: "203.0.113.3",
      port: 443,
      protocol: "trojan",
    });

    const results = await reconcileAllXrayNodes(db);

    expect(results).toHaveLength(1);
    expect(results[0]!.errors[0]).toContain("no SSH config");
  });
});
