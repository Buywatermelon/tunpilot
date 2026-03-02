import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { addNode, listNodes, getNode, updateNode, removeNode } from "./node";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
});

afterEach(() => {
  db?.$client?.close();
});

describe("addNode", () => {
  test("插入节点并返回带自动生成 ID 和 auth_secret 的完整记录", () => {
    const node = addNode(db, {
      name: "tokyo-1",
      host: "203.0.113.1",
      port: 443,
      protocol: "hysteria2",
    });

    expect(node.id).toBeString();
    expect(node.id.length).toBe(36); // UUID 格式
    expect(node.auth_secret).toBeString();
    expect(node.auth_secret.length).toBe(64); // 32 字节 = 64 个十六进制字符
    expect(node.name).toBe("tokyo-1");
    expect(node.host).toBe("203.0.113.1");
    expect(node.port).toBe(443);
    expect(node.protocol).toBe("hysteria2");
    expect(node.enabled).toBe(1);
    expect(node.created_at).toBeString();
  });

  test("接受可选字段", () => {
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
  test("无节点时返回空数组", () => {
    const nodes = listNodes(db);
    expect(nodes).toEqual([]);
  });

  test("返回所有节点", () => {
    addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    addNode(db, { name: "node-2", host: "2.2.2.2", port: 443, protocol: "hysteria2" });

    const nodes = listNodes(db);
    expect(nodes).toHaveLength(2);
    expect(nodes.map((n) => n.name).sort()).toEqual(["node-1", "node-2"]);
  });
});

describe("getNode", () => {
  test("根据 ID 返回节点", () => {
    const created = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const found = getNode(db, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
    expect(found!.name).toBe("node-1");
  });

  test("ID 不存在时返回 null", () => {
    const found = getNode(db, "non-existent-id");
    expect(found).toBeNull();
  });
});

describe("updateNode", () => {
  test("仅更新指定字段", () => {
    const created = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const updated = updateNode(db, created.id, { name: "node-1-updated", port: 8443 });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("node-1-updated");
    expect(updated!.port).toBe(8443);
    expect(updated!.host).toBe("1.1.1.1"); // 未修改
    expect(updated!.protocol).toBe("hysteria2"); // 未修改
  });

  test("更新不存在的节点时返回 null", () => {
    const updated = updateNode(db, "non-existent-id", { name: "nope" });
    expect(updated).toBeNull();
  });
});

describe("removeNode", () => {
  test("根据 ID 删除节点", () => {
    const created = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    removeNode(db, created.id);

    const found = getNode(db, created.id);
    expect(found).toBeNull();
  });

  test("级联删除 user_nodes", () => {
    const node = addNode(db, { name: "node-1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });

    // 插入用户并关联到此节点
    db.$client.run("INSERT INTO users (id, name, password) VALUES ('u1', 'testuser', 'pass')");
    db.$client.run("INSERT INTO user_nodes (user_id, node_id) VALUES ('u1', ?)", [node.id]);

    // 验证关联存在
    const before = db.$client.query("SELECT * FROM user_nodes WHERE node_id = ?").all(node.id);
    expect(before).toHaveLength(1);

    removeNode(db, node.id);

    // 关联应已被删除
    const after = db.$client.query("SELECT * FROM user_nodes WHERE node_id = ?").all(node.id);
    expect(after).toHaveLength(0);
  });
});
