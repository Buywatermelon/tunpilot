import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { authenticate } from "./auth.ts";
import { createUser, assignNodesToUser } from "./user.ts";
import { addNode } from "./node.ts";

describe("auth service", () => {
  let db: Db;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.$client?.close();
  });

  function setupNodeAndUser() {
    const node = addNode(db, {
      name: "US-1",
      host: "1.1.1.1",
      port: 443,
      protocol: "hysteria2",
    });
    const user = createUser(db, { name: "alice", password: "secret123" });
    assignNodesToUser(db, user.id, [node.id]);
    return { node, user };
  }

  // --- 节点校验 ---

  test("节点不存在时拒绝", () => {
    const result = authenticate(db, "nonexistent", "badsecret", "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("auth_secret 不匹配时拒绝", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, "wrong-secret", "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("节点禁用时拒绝", () => {
    const { node } = setupNodeAndUser();
    db.$client.run("UPDATE nodes SET enabled = 0 WHERE id = ?", [node.id]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  // --- 用户校验 ---

  test("无匹配密码的用户时拒绝", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, node.auth_secret, "wrongpassword");
    expect(result).toEqual({ ok: false });
  });

  test("用户禁用时拒绝", () => {
    const { node, user } = setupNodeAndUser();
    db.$client.run("UPDATE users SET enabled = 0 WHERE id = ?", [user.id]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("用户过期时拒绝", () => {
    const { node, user } = setupNodeAndUser();
    db.$client.run("UPDATE users SET expires_at = '2020-01-01 00:00:00' WHERE id = ?", [
      user.id,
    ]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("允许未过期的用户", () => {
    const { node, user } = setupNodeAndUser();
    db.$client.run("UPDATE users SET expires_at = '2099-12-31 23:59:59' WHERE id = ?", [
      user.id,
    ]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  test("允许 expires_at 为 null（永不过期）的用户", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  test("用户超出流量配额时拒绝", () => {
    const { node, user } = setupNodeAndUser();
    db.$client.run(
      "UPDATE users SET quota_bytes = 1000, used_bytes = 1001 WHERE id = ?",
      [user.id]
    );
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("允许配额为 0（无限）的用户", () => {
    const { node, user } = setupNodeAndUser();
    db.$client.run(
      "UPDATE users SET quota_bytes = 0, used_bytes = 999999999 WHERE id = ?",
      [user.id]
    );
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  test("允许配额内的用户", () => {
    const { node, user } = setupNodeAndUser();
    db.$client.run(
      "UPDATE users SET quota_bytes = 1000, used_bytes = 500 WHERE id = ?",
      [user.id]
    );
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  // --- 节点权限 ---

  test("用户未分配到节点时拒绝", () => {
    const node = addNode(db, {
      name: "US-1",
      host: "1.1.1.1",
      port: 443,
      protocol: "hysteria2",
    });
    createUser(db, { name: "alice", password: "secret123" });
    // 未调用 assignNodesToUser
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  // --- 认证成功 ---

  test("认证成功时返回用户名作为 ID", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });
});
