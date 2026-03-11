import { test, expect, beforeEach, afterEach, describe, mock } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { addNode } from "./node";
import { createUser, getUser, getUserNodes, assignNodesToUser } from "./user";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Node, User } from "../db/schema";
import { setClientFactory, closeAllXrayClients } from "./xray/pool";
import {
  updateUserWithSync,
  deleteUserWithSync,
  assignNodesWithSync,
  resetTrafficWithSync,
} from "./user-ops";

// Mock XrayClient
const mockAddUser = mock(() => Promise.resolve());
const mockRemoveUser = mock(() => Promise.resolve());

function createMockClient() {
  return {
    addUser: mockAddUser,
    removeUser: mockRemoveUser,
    queryTraffic: mock(() => Promise.resolve(new Map())),
    close: mock(() => {}),
  } as any;
}

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  mockAddUser.mockClear();
  mockRemoveUser.mockClear();
  closeAllXrayClients();
  setClientFactory(() => createMockClient());
});

afterEach(() => {
  closeAllXrayClients();
  db?.$client?.close();
});

function createTrojanNode(): Node {
  return addNode(db, {
    name: "trojan-us",
    host: "203.0.113.1",
    port: 443,
    protocol: "trojan",
    stats_port: 10085,
  });
}

function createTestUser(): User {
  return createUser(db, { name: "testuser", password: "testpass" });
}

describe("updateUserWithSync", () => {
  test("更新密码时触发 Xray 同步", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const updated = await updateUserWithSync(db, user.id, { password: "newpass" });

    expect(updated).not.toBeNull();
    expect(updated!.password).toBe("newpass");
    // Should have synced: remove old + add new
    expect(mockAddUser).toHaveBeenCalled();
  });

  test("更新 enabled 时触发 Xray 同步", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    await updateUserWithSync(db, user.id, { enabled: 0 });

    // Disabled user should be removed
    expect(mockRemoveUser).toHaveBeenCalled();
  });

  test("更新 quota 时不触发 Xray 同步", async () => {
    const user = createTestUser();
    await updateUserWithSync(db, user.id, { quota_bytes: 1000000 });

    expect(mockAddUser).not.toHaveBeenCalled();
    expect(mockRemoveUser).not.toHaveBeenCalled();
  });

  test("用户不存在时返回 null", async () => {
    const result = await updateUserWithSync(db, "nonexistent", { password: "x" });
    expect(result).toBeNull();
  });
});

describe("deleteUserWithSync", () => {
  test("删除前从 Xray 节点移除用户", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    await deleteUserWithSync(db, user.id);

    expect(mockRemoveUser).toHaveBeenCalled();
    expect(getUser(db, user.id)).toBeNull();
  });
});

describe("assignNodesWithSync", () => {
  test("分配 Trojan 节点时触发同步", async () => {
    const node = createTrojanNode();
    const user = createTestUser();

    await assignNodesWithSync(db, user.id, [node.id]);

    const nodes = getUserNodes(db, user.id);
    expect(nodes).toHaveLength(1);
    expect(mockAddUser).toHaveBeenCalled();
  });

  test("取消分配 Trojan 节点时触发移除", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    await assignNodesWithSync(db, user.id, []);

    const nodes = getUserNodes(db, user.id);
    expect(nodes).toHaveLength(0);
    expect(mockRemoveUser).toHaveBeenCalled();
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
