import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { initDatabase, type Db } from "../db/index";
import { createMcpServer } from "./index";
import { addNode } from "../services/node";
import { createUser, assignNodesToUser } from "../services/user";

const BASE_URL = "https://tunpilot.example.com";

let db: Db;
let client: Client;
let cleanup: () => Promise<void>;

async function setup() {
  db = initDatabase(":memory:");
  const server = createMcpServer(db, BASE_URL);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanup = async () => {
    await client.close();
    await server.close();
    db.$client.close();
  };
}

function parseResult(result: Awaited<ReturnType<typeof client.callTool>>): unknown {
  const content = result.content as Array<{ type: string; text: string }>;
  return JSON.parse(content[0]!.text);
}

// --- Nodes ---

describe("nodes tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("add_node returns node with auth_secret and callback URL", async () => {
    const result = await client.callTool({
      name: "add_node",
      arguments: {
        name: "tokyo-1",
        host: "203.0.113.1",
        port: 443,
        protocol: "hysteria2",
      },
    });
    const data = parseResult(result) as {
      node: { id: string; auth_secret: string; name: string };
      auth_callback_url: string;
    };
    expect(data.node.name).toBe("tokyo-1");
    expect(data.node.auth_secret).toHaveLength(64);
    expect(data.auth_callback_url).toContain(BASE_URL);
    expect(data.auth_callback_url).toContain(data.node.id);
    expect(data.auth_callback_url).toContain(data.node.auth_secret);
  });

  test("list_nodes returns all nodes", async () => {
    addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    addNode(db, { name: "n2", host: "2.2.2.2", port: 443, protocol: "hysteria2" });

    const result = await client.callTool({ name: "list_nodes", arguments: {} });
    const data = parseResult(result) as Array<unknown>;
    expect(data).toHaveLength(2);
  });

  test("update_node updates fields", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    const result = await client.callTool({
      name: "update_node",
      arguments: { id: node.id, name: "n1-updated", port: 8443 },
    });
    const data = parseResult(result) as { name: string; port: number };
    expect(data.name).toBe("n1-updated");
    expect(data.port).toBe(8443);
  });

  test("remove_node deletes a node", async () => {
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    await client.callTool({ name: "remove_node", arguments: { id: node.id } });

    const result = await client.callTool({ name: "list_nodes", arguments: {} });
    const data = parseResult(result) as Array<{ id: string }>;
    expect(data.find(n => n.id === node.id)).toBeUndefined();
  });
});

// --- Users ---

describe("users tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("create_user creates and returns user", async () => {
    const result = await client.callTool({
      name: "create_user",
      arguments: { name: "alice", password: "pass123" },
    });
    const data = parseResult(result) as { id: string; name: string };
    expect(data.name).toBe("alice");
    expect(data.id).toBeDefined();
  });

  test("list_users returns all users", async () => {
    createUser(db, { name: "alice", password: "p1" });
    createUser(db, { name: "bob", password: "p2" });

    const result = await client.callTool({ name: "list_users", arguments: {} });
    const data = parseResult(result) as Array<unknown>;
    expect(data).toHaveLength(2);
  });

  test("update_user updates fields", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    const result = await client.callTool({
      name: "update_user",
      arguments: { id: user.id, quota_bytes: 1073741824 },
    });
    const data = parseResult(result) as { quota_bytes: number };
    expect(data.quota_bytes).toBe(1073741824);
  });

  test("delete_user removes user", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    const result = await client.callTool({
      name: "delete_user",
      arguments: { id: user.id },
    });
    const data = parseResult(result) as { success: boolean };
    expect(data.success).toBe(true);
  });

  test("reset_traffic resets used_bytes", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    db.$client.run(`UPDATE users SET used_bytes = 999999 WHERE id = '${user.id}'`);
    await client.callTool({ name: "reset_traffic", arguments: { id: user.id } });

    const result = await client.callTool({ name: "list_users", arguments: {} });
    const data = parseResult(result) as Array<{ used_bytes: number }>;
    expect(data[0]!.used_bytes).toBe(0);
  });
});

// --- Subscriptions ---

describe("subscriptions tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("generate_subscription creates subscription and returns URL", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    const result = await client.callTool({
      name: "generate_subscription",
      arguments: { user_id: user.id, format: "shadowrocket" },
    });
    const data = parseResult(result) as { subscription_url: string; token: string };
    expect(data.subscription_url).toContain(BASE_URL + "/sub/");
    expect(data.token).toBeDefined();
  });

  test("list_subscriptions returns user subscriptions", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    await client.callTool({
      name: "generate_subscription",
      arguments: { user_id: user.id, format: "shadowrocket" },
    });
    await client.callTool({
      name: "generate_subscription",
      arguments: { user_id: user.id, format: "clash" },
    });

    const result = await client.callTool({
      name: "list_subscriptions",
      arguments: { user_id: user.id },
    });
    const data = parseResult(result) as Array<unknown>;
    expect(data).toHaveLength(2);
  });

  test("get_subscription_config returns config preview", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    const node = addNode(db, {
      name: "tokyo-1",
      host: "203.0.113.1",
      port: 443,
      protocol: "hysteria2",
      sni: "example.com",
    });
    assignNodesToUser(db, user.id, [node.id]);

    const subResult = await client.callTool({
      name: "generate_subscription",
      arguments: { user_id: user.id, format: "shadowrocket" },
    });
    const subData = parseResult(subResult) as { token: string };

    const result = await client.callTool({
      name: "get_subscription_config",
      arguments: { token: subData.token },
    });
    const data = parseResult(result) as { user: string; format: string; nodes: Array<unknown> };
    expect(data.user).toBe("alice");
    expect(data.format).toBe("shadowrocket");
    expect(data.nodes).toHaveLength(1);
  });
});

// --- Monitoring ---

describe("monitoring tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("check_health returns node statuses", async () => {
    addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });

    const result = await client.callTool({ name: "check_health", arguments: {} });
    const data = parseResult(result) as { nodes: Array<{ name: string; status: string }> };
    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0]!.name).toBe("n1");
  });

  test("get_traffic_stats returns traffic data", async () => {
    const user = createUser(db, { name: "alice", password: "p1" });
    const node = addNode(db, { name: "n1", host: "1.1.1.1", port: 443, protocol: "hysteria2" });
    db.$client.run(
      "INSERT INTO traffic_logs (user_id, node_id, tx_bytes, rx_bytes) VALUES (?, ?, 1000, 2000)",
      [user.id, node.id]
    );

    const result = await client.callTool({
      name: "get_traffic_stats",
      arguments: { user_id: user.id },
    });
    const data = parseResult(result) as { total_tx: number; total_rx: number };
    expect(data.total_tx).toBe(1000);
    expect(data.total_rx).toBe(2000);
  });

  test("list_nodes includes cert info", async () => {
    addNode(db, {
      name: "n1",
      host: "1.1.1.1",
      port: 443,
      protocol: "hysteria2",
      cert_expires: "2027-01-01T00:00:00Z",
      cert_path: "/etc/ssl/cert.pem",
    });

    const result = await client.callTool({ name: "list_nodes", arguments: {} });
    const data = parseResult(result) as Array<{ name: string; cert_expires: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.cert_expires).toBe("2027-01-01T00:00:00Z");
  });
});

// --- Settings ---

describe("settings tools", () => {
  beforeEach(setup);
  afterEach(async () => cleanup());

  test("set_setting and list_settings", async () => {
    await client.callTool({
      name: "set_setting",
      arguments: { key: "ipinfo_token", value: "tok_test123" },
    });

    const result = await client.callTool({ name: "list_settings", arguments: {} });
    const data = parseResult(result) as Array<{ key: string; masked_value: string }>;
    expect(data).toHaveLength(1);
    expect(data[0]!.key).toBe("ipinfo_token");
    expect(data[0]!.masked_value).toBe("tok_*******");
  });

  test("delete_setting removes setting", async () => {
    await client.callTool({
      name: "set_setting",
      arguments: { key: "ipinfo_token", value: "tok_test123" },
    });
    await client.callTool({
      name: "delete_setting",
      arguments: { key: "ipinfo_token" },
    });

    const result = await client.callTool({ name: "list_settings", arguments: {} });
    const data = parseResult(result) as Array<unknown>;
    expect(data).toHaveLength(0);
  });
});
