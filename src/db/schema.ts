import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 代理节点表
export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull(),
  stats_port: integer("stats_port"),
  stats_secret: text("stats_secret"),
  sni: text("sni"),
  cert_path: text("cert_path"),
  cert_expires: text("cert_expires"),
  hy2_version: text("hy2_version"),
  config_path: text("config_path"),
  ssh_user: text("ssh_user"),
  ssh_port: integer("ssh_port").default(22),
  ssh_alias: text("ssh_alias"),
  cert_fingerprint: text("cert_fingerprint"),
  insecure: integer("insecure").default(0),
  obfs_password: text("obfs_password"),
  enabled: integer("enabled").default(1),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

// 用户表
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  password: text("password").notNull(),
  quota_bytes: integer("quota_bytes").default(0),
  used_bytes: integer("used_bytes").default(0),
  expires_at: text("expires_at"),
  max_devices: integer("max_devices").default(3),
  enabled: integer("enabled").default(1),
  created_at: text("created_at").default(sql`(datetime('now'))`),
}, (table) => [
  uniqueIndex("idx_users_password").on(table.password),
]);

// 用户-节点关联表
export const userNodes = sqliteTable("user_nodes", {
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  node_id: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
}, (table) => [
  primaryKey({ columns: [table.user_id, table.node_id] }),
]);

// 订阅表
export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  format: text("format").notNull(),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

// 流量日志表
export const trafficLogs = sqliteTable("traffic_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  user_id: text("user_id").references(() => users.id),
  node_id: text("node_id").references(() => nodes.id),
  tx_bytes: integer("tx_bytes").default(0),
  rx_bytes: integer("rx_bytes").default(0),
  recorded_at: text("recorded_at").default(sql`(datetime('now'))`),
}, (table) => [
  index("idx_traffic_logs_recorded_at").on(table.recorded_at),
  index("idx_traffic_logs_user_node").on(table.user_id, table.node_id),
]);

// 系统设置表（API Key 等）
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: text("updated_at").default(sql`(datetime('now'))`),
});

export type Setting = typeof settings.$inferSelect;

// 分流规则表
export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(),
  rule_set_key: text("rule_set_key").notNull(),
  action: text("action").notNull(),
  strict: integer("strict").default(0),
  priority: integer("priority").default(0),
  enabled: integer("enabled").default(1),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

export type RoutingRule = typeof routingRules.$inferSelect;
export type NewRoutingRule = typeof routingRules.$inferInsert;

// 自定义域名/IP 分流规则表
export const customRules = sqliteTable("custom_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(), // "domain" | "domain_suffix" | "domain_keyword" | "ip_cidr"
  value: text("value").notNull(),
  action: text("action").notNull(), // "direct" | "reject" | "proxy"
  priority: integer("priority").default(100),
  enabled: integer("enabled").default(1),
  description: text("description"),
  created_at: text("created_at").default(sql`(datetime('now'))`),
});

export type CustomRule = typeof customRules.$inferSelect;
export type NewCustomRule = typeof customRules.$inferInsert;

// 从 schema 推导的类型
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type TrafficLog = typeof trafficLogs.$inferSelect;
export type NewTrafficLog = typeof trafficLogs.$inferInsert;
