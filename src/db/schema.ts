import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// 代理节点表
export const nodes = sqliteTable("nodes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  protocol: text("protocol").notNull(),
  auth_secret: text("auth_secret").notNull(),
  stats_port: integer("stats_port"),
  stats_secret: text("stats_secret"),
  sni: text("sni"),
  cert_path: text("cert_path"),
  cert_expires: text("cert_expires"),
  hy2_version: text("hy2_version"),
  config_path: text("config_path"),
  ssh_user: text("ssh_user"),
  ssh_port: integer("ssh_port").default(22),
  insecure: integer("insecure").default(0),
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
  index("idx_users_password").on(table.password),
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

// 从 schema 推导的类型
export type Node = typeof nodes.$inferSelect;
export type NewNode = typeof nodes.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type TrafficLog = typeof trafficLogs.$inferSelect;
export type NewTrafficLog = typeof trafficLogs.$inferInsert;
