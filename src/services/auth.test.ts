import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initDatabase } from "../db/index.ts";
import { authenticate } from "./auth.ts";
import { createUser, assignNodesToUser } from "./user.ts";
import { addNode } from "./node.ts";

describe("auth service", () => {
  let db: Database;

  beforeEach(() => {
    db = initDatabase(":memory:");
  });

  afterEach(() => {
    db?.close();
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

  // --- Node validation ---

  test("rejects when node does not exist", () => {
    const result = authenticate(db, "nonexistent", "badsecret", "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("rejects when auth_secret does not match", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, "wrong-secret", "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("rejects when node is disabled", () => {
    const { node, user } = setupNodeAndUser();
    db.run("UPDATE nodes SET enabled = 0 WHERE id = ?", [node.id]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  // --- User validation ---

  test("rejects when no user matches password", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, node.auth_secret, "wrongpassword");
    expect(result).toEqual({ ok: false });
  });

  test("rejects when user is disabled", () => {
    const { node, user } = setupNodeAndUser();
    db.run("UPDATE users SET enabled = 0 WHERE id = ?", [user.id]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("rejects when user is expired", () => {
    const { node, user } = setupNodeAndUser();
    db.run("UPDATE users SET expires_at = '2020-01-01 00:00:00' WHERE id = ?", [
      user.id,
    ]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("allows user with future expiry", () => {
    const { node, user } = setupNodeAndUser();
    db.run("UPDATE users SET expires_at = '2099-12-31 23:59:59' WHERE id = ?", [
      user.id,
    ]);
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  test("allows user with null expires_at (never expires)", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  test("rejects when user exceeds quota", () => {
    const { node, user } = setupNodeAndUser();
    db.run(
      "UPDATE users SET quota_bytes = 1000, used_bytes = 1001 WHERE id = ?",
      [user.id]
    );
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  test("allows user with zero quota (unlimited)", () => {
    const { node, user } = setupNodeAndUser();
    db.run(
      "UPDATE users SET quota_bytes = 0, used_bytes = 999999999 WHERE id = ?",
      [user.id]
    );
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  test("allows user under quota", () => {
    const { node, user } = setupNodeAndUser();
    db.run(
      "UPDATE users SET quota_bytes = 1000, used_bytes = 500 WHERE id = ?",
      [user.id]
    );
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });

  // --- Node permission ---

  test("rejects when user is not assigned to node", () => {
    const node = addNode(db, {
      name: "US-1",
      host: "1.1.1.1",
      port: 443,
      protocol: "hysteria2",
    });
    createUser(db, { name: "alice", password: "secret123" });
    // No assignNodesToUser call
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: false });
  });

  // --- Success ---

  test("returns ok with user name as id on success", () => {
    const { node } = setupNodeAndUser();
    const result = authenticate(db, node.id, node.auth_secret, "secret123");
    expect(result).toEqual({ ok: true, id: "alice" });
  });
});
