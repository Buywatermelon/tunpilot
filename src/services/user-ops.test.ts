import { test, expect, beforeEach, afterEach, describe, mock, spyOn } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { addNode } from "./node";
import { createUser, getUser, getUserNodes, assignNodesToUser } from "./user";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Node, User } from "../db/schema";
import * as sshModule from "./xray/ssh";
import {
  updateUserWithSync,
  deleteUserWithSync,
  assignNodesWithSync,
  resetTrafficWithSync,
} from "./user-ops";

// Mock SSH operations
const mockSshExec = spyOn(sshModule, "sshExec");
const mockSshWriteFile = spyOn(sshModule, "sshWriteFile");

function makeXrayConfig(clients: any[] = []) {
  return JSON.stringify({
    inbounds: [{
      tag: "trojan-in",
      port: 443,
      protocol: "trojan",
      settings: { clients },
    }],
    outbounds: [{ tag: "direct", protocol: "freedom" }],
  });
}

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  mockSshExec.mockReset();
  mockSshWriteFile.mockReset();
  mockSshExec.mockImplementation(async (_node: Node, cmd: string) => {
    if (cmd.startsWith("cat ")) return makeXrayConfig();
    return "";
  });
  mockSshWriteFile.mockResolvedValue(undefined);
});

afterEach(() => {
  db?.$client?.close();
});

function createTrojanNode(): Node {
  return addNode(db, {
    name: "trojan-us",
    host: "203.0.113.1",
    port: 443,
    protocol: "trojan",
    stats_port: 10085,
    ssh_user: "root",
  });
}

function createTestUser(): User {
  return createUser(db, { name: "testuser", password: "testpass" });
}

describe("updateUserWithSync", () => {
  test("更新密码时触发配置部署", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const updated = await updateUserWithSync(db, user.id, { password: "newpass" });

    expect(updated).not.toBeNull();
    expect(updated!.password).toBe("newpass");
    expect(mockSshWriteFile).toHaveBeenCalled();
    const config = JSON.parse(mockSshWriteFile.mock.calls[0]![2] as string);
    expect(config.inbounds[0].settings.clients[0].password).toBe("newpass");
  });

  test("更新 enabled 时触发配置部署", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    // Config has user currently
    mockSshExec.mockImplementation(async (_n: Node, cmd: string) => {
      if (cmd.startsWith("cat ")) return makeXrayConfig([{ password: user.password, email: user.name, level: 0 }]);
      return "";
    });

    await updateUserWithSync(db, user.id, { enabled: 0 });

    expect(mockSshWriteFile).toHaveBeenCalled();
    const config = JSON.parse(mockSshWriteFile.mock.calls[0]![2] as string);
    expect(config.inbounds[0].settings.clients).toHaveLength(0);
  });

  test("更新 quota 时不触发同步", async () => {
    const user = createTestUser();
    await updateUserWithSync(db, user.id, { quota_bytes: 1000000 });

    expect(mockSshWriteFile).not.toHaveBeenCalled();
  });

  test("用户不存在时返回 null", async () => {
    const result = await updateUserWithSync(db, "nonexistent", { password: "x" });
    expect(result).toBeNull();
  });
});

describe("deleteUserWithSync", () => {
  test("删除用户后部署更新的配置", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    // Config has user currently
    mockSshExec.mockImplementation(async (_n: Node, cmd: string) => {
      if (cmd.startsWith("cat ")) return makeXrayConfig([{ password: user.password, email: user.name, level: 0 }]);
      return "";
    });

    await deleteUserWithSync(db, user.id);

    expect(mockSshWriteFile).toHaveBeenCalled();
    const config = JSON.parse(mockSshWriteFile.mock.calls[0]![2] as string);
    expect(config.inbounds[0].settings.clients).toHaveLength(0);
    expect(getUser(db, user.id)).toBeNull();
  });
});

describe("assignNodesWithSync", () => {
  test("分配 Trojan 节点时触发配置部署", async () => {
    const node = createTrojanNode();
    const user = createTestUser();

    await assignNodesWithSync(db, user.id, [node.id]);

    const nodes = getUserNodes(db, user.id);
    expect(nodes).toHaveLength(1);
    expect(mockSshWriteFile).toHaveBeenCalled();
  });

  test("取消分配 Trojan 节点时触发配置部署", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    // Config has user currently
    mockSshExec.mockImplementation(async (_n: Node, cmd: string) => {
      if (cmd.startsWith("cat ")) return makeXrayConfig([{ password: user.password, email: user.name, level: 0 }]);
      return "";
    });

    await assignNodesWithSync(db, user.id, []);

    const nodes = getUserNodes(db, user.id);
    expect(nodes).toHaveLength(0);
    expect(mockSshWriteFile).toHaveBeenCalled();
  });
});

describe("resetTrafficWithSync", () => {
  test("重置 DB 流量", async () => {
    const user = createTestUser();
    db.update(users).set({ used_bytes: 10000 }).where(eq(users.id, user.id)).run();

    await resetTrafficWithSync(db, user.id);

    const updated = getUser(db, user.id);
    expect(updated!.used_bytes).toBe(0);
  });
});
