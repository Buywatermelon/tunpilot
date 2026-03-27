import { eq } from "drizzle-orm";
import type { Db } from "../db/index";
import { subscriptions, type Subscription } from "../db/schema";
import { getUser, getUserNodes } from "./user";
import { getFormat } from "./formats/index";

export interface SubscriptionWithUrl extends Subscription {
  url?: string;
}

export interface SubscriptionConfig {
  content: string;
  contentType: string;
}

// 生成订阅链接
export function generateSubscription(
  db: Db,
  userId: string,
  format: string,
  baseUrl?: string
): SubscriptionWithUrl {
  const sub = db
    .insert(subscriptions)
    .values({ user_id: userId, format })
    .returning()
    .get() as SubscriptionWithUrl;

  if (baseUrl) {
    sub.url = `${baseUrl}/sub/${sub.token}`;
  }
  return sub;
}

// 列出用户的所有订阅
export function listSubscriptions(db: Db, userId: string): Subscription[] {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.user_id, userId))
    .all();
}

// 删除订阅（撤销 token）
export function deleteSubscription(db: Db, id: string): void {
  db.delete(subscriptions).where(eq(subscriptions.id, id)).run();
}

// 根据 token 获取订阅
export function getSubscriptionByToken(db: Db, token: string): Subscription | null {
  return (
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.token, token))
      .get() ?? null
  );
}

// 获取订阅配置内容（根据格式渲染）
export function getSubscriptionConfig(
  db: Db,
  token: string,
  baseUrl?: string
): SubscriptionConfig | null {
  const sub = getSubscriptionByToken(db, token);
  if (!sub) return null;

  const user = getUser(db, sub.user_id);
  if (!user) return null;

  const nodes = getUserNodes(db, user.id).filter((n) => n.enabled === 1);

  const format = getFormat(sub.format);
  if (!format) return null;

  const subscriptionUrl = baseUrl ? `${baseUrl}/sub/${token}` : undefined;
  return {
    content: format.render(user, nodes, { subscriptionUrl }),
    contentType: format.contentType,
  };
}

export type { Subscription } from "../db/schema";
