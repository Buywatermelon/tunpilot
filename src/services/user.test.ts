import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deleteUser,
  resetTraffic,
  assignNodesToUser,
  getUserNodes,
} from "./user.ts";

describe("user service", () => {
  let db: Db;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.$client?.close();
  });

  // --- createUser ---

  describe("createUser", () => {
    test("使用必填字段创建用户", () => {
      const user = createUser(db, { name: "alice", password: "pass123" });
      expect(user.id).toBeDefined();
      expect(user.name).toBe("alice");
      expect(user.password).toBe("pass123");
      expect(user.quota_bytes).toBe(0);
      expect(user.used_bytes).toBe(0);
      expect(user.max_devices).toBe(3);
      expect(user.enabled).toBe(1);
      expect(user.expires_at).toBeNull();
      expect(user.created_at).toBeDefined();
    });

    test("使用可选字段创建用户", () => {
      const user = createUser(db, {
        name: "bob",
        password: "secret",
        quota_bytes: 1073741824,
        expires_at: "2026-12-31 23:59:59",
        max_devices: 5,
      });
      expect(user.quota_bytes).toBe(1073741824);
      expect(user.expires_at).toBe("2026-12-31 23:59:59");
      expect(user.max_devices).toBe(5);
    });

    test("生成唯一 ID", () => {
      const u1 = createUser(db, { name: "alice", password: "p1" });
      const u2 = createUser(db, { name: "bob", password: "p2" });
      expect(u1.id).not.toBe(u2.id);
    });

    test("拒绝重复用户名", () => {
      createUser(db, { name: "alice", password: "p1" });
      expect(() => createUser(db, { name: "alice", password: "p2" })).toThrow();
    });
  });

  // --- listUsers ---

  describe("listUsers", () => {
    test("无用户时返回空数组", () => {
      const users = listUsers(db);
      expect(users).toEqual([]);
    });

    test("返回所有用户", () => {
      createUser(db, { name: "alice", password: "p1" });
      createUser(db, { name: "bob", password: "p2" });
      const users = listUsers(db);
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.name).sort()).toEqual(["alice", "bob"]);
    });

    test("包含 used_bytes 和 enabled 字段", () => {
      createUser(db, { name: "alice", password: "p1" });
      const users = listUsers(db);
      expect(users[0]!.used_bytes).toBe(0);
      expect(users[0]!.enabled).toBe(1);
    });
  });

  // --- getUser ---

  describe("getUser", () => {
    test("根据 ID 返回用户", () => {
      const created = createUser(db, { name: "alice", password: "p1" });
      const found = getUser(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("alice");
      expect(found!.id).toBe(created.id);
    });

    test("ID 不存在时返回 null", () => {
      const found = getUser(db, "nonexistent");
      expect(found).toBeNull();
    });
  });

  // --- updateUser ---

  describe("updateUser", () => {
    test("更新 quota_bytes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { quota_bytes: 5368709120 });
      const updated = getUser(db, user.id);
      expect(updated!.quota_bytes).toBe(5368709120);
    });

    test("更新 expires_at", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { expires_at: "2027-01-01 00:00:00" });
      const updated = getUser(db, user.id);
      expect(updated!.expires_at).toBe("2027-01-01 00:00:00");
    });

    test("更新 enabled", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { enabled: 0 });
      const updated = getUser(db, user.id);
      expect(updated!.enabled).toBe(0);
    });

    test("更新 password", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { password: "newpass" });
      const updated = getUser(db, user.id);
      expect(updated!.password).toBe("newpass");
    });

    test("更新 max_devices", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { max_devices: 10 });
      const updated = getUser(db, user.id);
      expect(updated!.max_devices).toBe(10);
    });

    test("同时更新多个字段", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, {
        quota_bytes: 1000000,
        enabled: 0,
        max_devices: 1,
      });
      const updated = getUser(db, user.id);
      expect(updated!.quota_bytes).toBe(1000000);
      expect(updated!.enabled).toBe(0);
      expect(updated!.max_devices).toBe(1);
    });

    test("空更新不做任何操作", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, {});
      const updated = getUser(db, user.id);
      expect(updated!.name).toBe("alice");
    });
  });

  // --- deleteUser ---

  describe("deleteUser", () => {
    test("删除已有用户", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      deleteUser(db, user.id);
      expect(getUser(db, user.id)).toBeNull();
    });

    test("级联删除 user_nodes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      // 手动插入节点以建立关联
      db.$client.run(
        "INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')"
      );
      db.$client.run(
        `INSERT INTO user_nodes (user_id, node_id) VALUES ('${user.id}', 'n1')`
      );
      deleteUser(db, user.id);
      const rows = db.$client.query("SELECT * FROM user_nodes").all();
      expect(rows).toHaveLength(0);
    });

    test("删除不存在的用户不抛异常", () => {
      expect(() => deleteUser(db, "nonexistent")).not.toThrow();
    });
  });

  // --- resetTraffic ---

  describe("resetTraffic", () => {
    test("将 used_bytes 重置为 0", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      // 模拟流量使用
      db.$client.run(`UPDATE users SET used_bytes = 999999 WHERE id = '${user.id}'`);
      resetTraffic(db, user.id);
      const updated = getUser(db, user.id);
      expect(updated!.used_bytes).toBe(0);
    });

    test("重置不存在的用户不抛异常", () => {
      expect(() => resetTraffic(db, "nonexistent")).not.toThrow();
    });
  });

  // --- assignNodesToUser ---

  describe("assignNodesToUser", () => {
    function insertNode(id: string) {
      db.$client.run(
        `INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('${id}', 'Node ${id}', 'host', 443, 'hysteria2', 'secret')`
      );
    }

    test("为用户分配节点", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      insertNode("n2");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      const rows = db.$client
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id) as { node_id: string }[];
      expect(rows.map((r) => r.node_id).sort()).toEqual(["n1", "n2"]);
    });

    test("替换现有分配", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      insertNode("n2");
      insertNode("n3");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      assignNodesToUser(db, user.id, ["n2", "n3"]);
      const rows = db.$client
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id) as { node_id: string }[];
      expect(rows.map((r) => r.node_id).sort()).toEqual(["n2", "n3"]);
    });

    test("空数组清除所有分配", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      assignNodesToUser(db, user.id, ["n1"]);
      assignNodesToUser(db, user.id, []);
      const rows = db.$client
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id);
      expect(rows).toHaveLength(0);
    });
  });

  // --- getUserNodes ---

  describe("getUserNodes", () => {
    function insertNode(id: string, name: string) {
      db.$client.run(
        `INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('${id}', '${name}', 'host', 443, 'hysteria2', 'secret')`
      );
    }

    test("返回用户关联的节点", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1", "US Node");
      insertNode("n2", "JP Node");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      const nodes = getUserNodes(db, user.id);
      expect(nodes).toHaveLength(2);
      expect(nodes.map((n) => n.name).sort()).toEqual(["JP Node", "US Node"]);
    });

    test("无节点时返回空数组", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      const nodes = getUserNodes(db, user.id);
      expect(nodes).toEqual([]);
    });

    test("返回完整的节点记录", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1", "US Node");
      assignNodesToUser(db, user.id, ["n1"]);
      const nodes = getUserNodes(db, user.id);
      expect(nodes[0]!.id).toBe("n1");
      expect(nodes[0]!.host).toBe("host");
      expect(nodes[0]!.port).toBe(443);
      expect(nodes[0]!.protocol).toBe("hysteria2");
    });
  });
});
