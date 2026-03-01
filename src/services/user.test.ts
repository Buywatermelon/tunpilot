import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../db/index.ts";
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
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.close();
  });

  // --- createUser ---

  describe("createUser", () => {
    test("creates user with required fields", () => {
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

    test("creates user with optional fields", () => {
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

    test("generates unique ids", () => {
      const u1 = createUser(db, { name: "alice", password: "p1" });
      const u2 = createUser(db, { name: "bob", password: "p2" });
      expect(u1.id).not.toBe(u2.id);
    });

    test("rejects duplicate name", () => {
      createUser(db, { name: "alice", password: "p1" });
      expect(() => createUser(db, { name: "alice", password: "p2" })).toThrow();
    });
  });

  // --- listUsers ---

  describe("listUsers", () => {
    test("returns empty array when no users", () => {
      const users = listUsers(db);
      expect(users).toEqual([]);
    });

    test("returns all users", () => {
      createUser(db, { name: "alice", password: "p1" });
      createUser(db, { name: "bob", password: "p2" });
      const users = listUsers(db);
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.name).sort()).toEqual(["alice", "bob"]);
    });

    test("includes used_bytes and enabled fields", () => {
      createUser(db, { name: "alice", password: "p1" });
      const users = listUsers(db);
      expect(users[0]!.used_bytes).toBe(0);
      expect(users[0]!.enabled).toBe(1);
    });
  });

  // --- getUser ---

  describe("getUser", () => {
    test("returns user by id", () => {
      const created = createUser(db, { name: "alice", password: "p1" });
      const found = getUser(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("alice");
      expect(found!.id).toBe(created.id);
    });

    test("returns null for non-existent id", () => {
      const found = getUser(db, "nonexistent");
      expect(found).toBeNull();
    });
  });

  // --- updateUser ---

  describe("updateUser", () => {
    test("updates quota_bytes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { quota_bytes: 5368709120 });
      const updated = getUser(db, user.id);
      expect(updated!.quota_bytes).toBe(5368709120);
    });

    test("updates expires_at", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { expires_at: "2027-01-01 00:00:00" });
      const updated = getUser(db, user.id);
      expect(updated!.expires_at).toBe("2027-01-01 00:00:00");
    });

    test("updates enabled", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { enabled: 0 });
      const updated = getUser(db, user.id);
      expect(updated!.enabled).toBe(0);
    });

    test("updates password", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { password: "newpass" });
      const updated = getUser(db, user.id);
      expect(updated!.password).toBe("newpass");
    });

    test("updates max_devices", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, { max_devices: 10 });
      const updated = getUser(db, user.id);
      expect(updated!.max_devices).toBe(10);
    });

    test("updates multiple fields at once", () => {
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

    test("does nothing with empty updates", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      updateUser(db, user.id, {});
      const updated = getUser(db, user.id);
      expect(updated!.name).toBe("alice");
    });
  });

  // --- deleteUser ---

  describe("deleteUser", () => {
    test("deletes existing user", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      deleteUser(db, user.id);
      expect(getUser(db, user.id)).toBeNull();
    });

    test("cascades to user_nodes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      // Insert a node manually for the relationship
      db.run(
        "INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('n1', 'US', 'host', 443, 'hysteria2', 'secret')"
      );
      db.run(
        `INSERT INTO user_nodes (user_id, node_id) VALUES ('${user.id}', 'n1')`
      );
      deleteUser(db, user.id);
      const rows = db.query("SELECT * FROM user_nodes").all();
      expect(rows).toHaveLength(0);
    });

    test("does not throw for non-existent user", () => {
      expect(() => deleteUser(db, "nonexistent")).not.toThrow();
    });
  });

  // --- resetTraffic ---

  describe("resetTraffic", () => {
    test("sets used_bytes to 0", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      // Simulate traffic usage
      db.run(`UPDATE users SET used_bytes = 999999 WHERE id = '${user.id}'`);
      resetTraffic(db, user.id);
      const updated = getUser(db, user.id);
      expect(updated!.used_bytes).toBe(0);
    });

    test("does not throw for non-existent user", () => {
      expect(() => resetTraffic(db, "nonexistent")).not.toThrow();
    });
  });

  // --- assignNodesToUser ---

  describe("assignNodesToUser", () => {
    function insertNode(id: string) {
      db.run(
        `INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('${id}', 'Node ${id}', 'host', 443, 'hysteria2', 'secret')`
      );
    }

    test("assigns nodes to user", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      insertNode("n2");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      const rows = db
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id) as { node_id: string }[];
      expect(rows.map((r) => r.node_id).sort()).toEqual(["n1", "n2"]);
    });

    test("replaces existing assignments", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      insertNode("n2");
      insertNode("n3");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      assignNodesToUser(db, user.id, ["n2", "n3"]);
      const rows = db
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id) as { node_id: string }[];
      expect(rows.map((r) => r.node_id).sort()).toEqual(["n2", "n3"]);
    });

    test("clears all assignments with empty array", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1");
      assignNodesToUser(db, user.id, ["n1"]);
      assignNodesToUser(db, user.id, []);
      const rows = db
        .query("SELECT node_id FROM user_nodes WHERE user_id = ?")
        .all(user.id);
      expect(rows).toHaveLength(0);
    });
  });

  // --- getUserNodes ---

  describe("getUserNodes", () => {
    function insertNode(id: string, name: string) {
      db.run(
        `INSERT INTO nodes (id, name, host, port, protocol, auth_secret) VALUES ('${id}', '${name}', 'host', 443, 'hysteria2', 'secret')`
      );
    }

    test("returns nodes assigned to user", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      insertNode("n1", "US Node");
      insertNode("n2", "JP Node");
      assignNodesToUser(db, user.id, ["n1", "n2"]);
      const nodes = getUserNodes(db, user.id);
      expect(nodes).toHaveLength(2);
      expect(nodes.map((n) => n.name).sort()).toEqual(["JP Node", "US Node"]);
    });

    test("returns empty array for user with no nodes", () => {
      const user = createUser(db, { name: "alice", password: "p1" });
      const nodes = getUserNodes(db, user.id);
      expect(nodes).toEqual([]);
    });

    test("returns full node records", () => {
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
