import { test, expect, beforeEach, describe } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../db/index";
import { addNode, listNodes, getNode, updateNode, removeNode } from "./node";

let db: Database;

beforeEach(() => {
  db = initDatabase(":memory:");
});

describe("addNode", () => {
  test("inserts a node and returns the full record with auto-generated id and auth_secret", () => {
    const node = addNode(db, {
      name: "tokyo-1",
      host: "203.0.113.1",
      port: 443,
      protocol: "hysteria2",
    });

    expect(node.id).toBeString();
    expect(node.id.length).toBe(36); // UUID format
    expect(node.auth_secret).toBeString();
    expect(node.auth_secret.length).toBe(64); // 32 bytes = 64 hex chars
    expect(node.name).toBe("tokyo-1");
    expect(node.host).toBe("203.0.113.1");
    expect(node.port).toBe(443);
    expect(node.protocol).toBe("hysteria2");
    expect(node.enabled).toBe(1);
    expect(node.created_at).toBeString();
  });

  test("accepts optional fields", () => {
    const node = addNode(db, {
      name: "tokyo-2",
      host: "203.0.113.2",
      port: 443,
      protocol: "hysteria2",
      stats_port: 9090,
      stats_secret: "s3cret",
      sni: "example.com",
      cert_path: "/etc/ssl/cert.pem",
      cert_expires: "2027-01-01T00:00:00Z",
      hy2_version: "2.6.0",
      config_path: "/etc/hy2/config.yaml",
      ssh_user: "root",
      ssh_port: 2222,
      enabled: 0,
    });

    expect(node.stats_port).toBe(9090);
    expect(node.stats_secret).toBe("s3cret");
    expect(node.sni).toBe("example.com");
    expect(node.cert_path).toBe("/etc/ssl/cert.pem");
    expect(node.cert_expires).toBe("2027-01-01T00:00:00Z");
    expect(node.hy2_version).toBe("2.6.0");
    expect(node.config_path).toBe("/etc/hy2/config.yaml");
    expect(node.ssh_user).toBe("root");
    expect(node.ssh_port).toBe(2222);
    expect(node.enabled).toBe(0);
  });
});

describe("listNodes", () => {
  test("returns empty array when no nodes exist", () => {
    const nodes = listNodes(db);
    expect(nodes).toEqual([]);
  });

  test("returns all nodes", () => {
    addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    addNode(db, { name: "node-2", host: "2.2.2.2", port: 443, protocol: "hysteria2" });

    const nodes = listNodes(db);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.name).sort()).toEqual(["node-1", "node-2"]);
  });
});

describe("getNode", () => {
  test("returns a node by id", () => {
    const created = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const found = getNode(db, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("node-1");
  });

  test("returns null for non-existent id", () => {
    const found = getNode(db, "non-existent-id");
    expect(found).toBeNull();
  });
});

describe("updateNode", () => {
  test("updates provided fields only", () => {
    const created = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const updated = updateNode(db, created.id, { name: "node-1-updated", port: 8443 });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("node-1-updated");
    expect(updated!.port).toBe(8443);
    expect(updated!.host).toBe("1.1.1.1"); // unchanged
    expect(updated!.protocol).toBe("hysteria2"); // unchanged
  });

  test("returns null when updating non-existent node", () => {
    const updated = updateNode(db, "non-existent-id", { name: "nope" });
    expect(updated).toBeNull();
  });
});

describe("removeNode", () => {
  test("deletes a node by id", () => {
    const created = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    removeNode(db, created.id);

    const found = getNode(db, created.id);
    expect(found).toBeNull();
  });

  test("cascades delete to user_nodes", () => {
    const node = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });

    // Insert a user and link to this node
    db.run("INSERT INTO users (id, name, password) VALUES ('u1', 'testuser', 'pass')");
    db.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', ?)", [node.id]);

    // Verify link exists
    const before = db.query("SELECT * FROM user_nodes WHERE node_id = ?").all(node.id);
    expect(before).toHaveLength(1);

    removeNode(db, node.id);

    // Link should be gone
    const after = db.query("SELECT * FROM user_nodes WHERE node_id = ?").all(node.id);
    expect(after).toHaveLength(0);
  });
});
