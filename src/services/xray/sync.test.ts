import { test, expect, beforeEach, afterEach, describe, mock } from "bun:test";
import { initDatabase, type Db } from "../../db/index";
import { addNode } from "../node";
import { createUser, assignNodesToUser } from "../user";
import { users } from "../../db/schema";
import { eq } from "drizzle-orm";
import type { Node, User } from "../../db/schema";
import { setClientFactory, closeAllXrayClients } from "./pool";
import {
  syncUserToXrayNodes,
  removeUserFromXrayNodes,
  reconcileAllXrayNodes,
} from "./sync";

// Mock XrayClient that records calls
const mockAddUser = mock(() => Promise.resolve());
const mockRemoveUser = mock(() => Promise.resolve());
const mockQueryTraffic = mock(() => Promise.resolve(new Map()));

function createMockClient() {
  return {
    addUser: mockAddUser,
    removeUser: mockRemoveUser,
    queryTraffic: mockQueryTraffic,
    close: mock(() => {}),
  } as any;
}

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
  mockAddUser.mockClear();
  mockRemoveUser.mockClear();
  mockQueryTraffic.mockClear();
  // Inject mock client factory
  closeAllXrayClients();
  setClientFactory(() => createMockClient());
});

afterEach(() => {
  closeAllXrayClients();
  db?.$client?.close();
});

function createTrojanNode(name: string = "trojan-us"): Node {
  return addNode(db, {
    name,
    host: "203.0.113.1",
    port: 443,
    protocol: "trojan",
    stats_port: 10085,
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
  test("为活跃用户在 Trojan 节点上添加用户", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockRemoveUser).toHaveBeenCalled();
    expect(mockAddUser).toHaveBeenCalledWith("trojan-in", user.name, user.password);
  });

  test("不对 Hysteria2 节点进行 gRPC 操作", async () => {
    const node = createHy2Node();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockAddUser).not.toHaveBeenCalled();
    expect(mockRemoveUser).not.toHaveBeenCalled();
  });

  test("为禁用用户移除 Xray 访问", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    db.update(users).set({ enabled: 0 }).where(eq(users.id, user.id)).run();

    const errors = await syncUserToXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockRemoveUser).toHaveBeenCalledWith("trojan-in", user.name);
    expect(mockAddUser).not.toHaveBeenCalled();
  });

  test("用户不存在时返回空错误列表", async () => {
    const errors = await syncUserToXrayNodes(db, "nonexistent-id");
    expect(errors).toHaveLength(0);
  });
});

describe("removeUserFromXrayNodes", () => {
  test("从指定 Trojan 节点移除用户", async () => {
    const node = createTrojanNode();
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node.id]);

    const errors = await removeUserFromXrayNodes(db, user.id, [node.id]);

    expect(errors).toHaveLength(0);
    expect(mockRemoveUser).toHaveBeenCalledWith("trojan-in", user.name);
  });

  test("从所有分配的 Trojan 节点移除用户", async () => {
    const node1 = createTrojanNode("trojan-1");
    const node2 = createTrojanNode("trojan-2");
    const user = createTestUser();
    assignNodesToUser(db, user.id, [node1.id, node2.id]);

    const errors = await removeUserFromXrayNodes(db, user.id);

    expect(errors).toHaveLength(0);
    expect(mockRemoveUser).toHaveBeenCalledTimes(2);
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

  test("跳过未配置 stats_port 的 Trojan 节点", async () => {
    addNode(db, {
      name: "no-api",
      host: "203.0.113.3",
      port: 443,
      protocol: "trojan",
    });

    const results = await reconcileAllXrayNodes(db);

    expect(results).toHaveLength(1);
    expect(results[0]!.errors[0]).toContain("No gRPC client");
  });
});
