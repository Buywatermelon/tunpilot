import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { join } from "node:path";

const PROTO_DIR = join(import.meta.dir, "proto");

// Load proto definitions once at module level
const handlerDef = protoLoader.loadSync(join(PROTO_DIR, "handler.proto"), {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});
const handlerProto = grpc.loadPackageDefinition(handlerDef);

const statsDef = protoLoader.loadSync(join(PROTO_DIR, "stats.proto"), {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});
const statsProto = grpc.loadPackageDefinition(statsDef);

const trojanDef = protoLoader.loadSync(join(PROTO_DIR, "trojan.proto"), {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});
const trojanProto = grpc.loadPackageDefinition(trojanDef);

// Extract service constructors
const HandlerService = (handlerProto.xray as any).app.proxyman.command.HandlerService;
const StatsService = (statsProto.xray as any).app.stats.command.StatsService;
const TrojanAccount = (trojanProto.xray as any).proxy.trojan.Account;

// Xray uses fully-qualified type names for TypedMessage
const ADD_USER_OP_TYPE = "xray.app.proxyman.command.AddUserOperation";
const REMOVE_USER_OP_TYPE = "xray.app.proxyman.command.RemoveUserOperation";
const TROJAN_ACCOUNT_TYPE = "xray.proxy.trojan.Account";

// Extract message types for manual serialization
const AddUserOperation = (handlerProto.xray as any).app.proxyman.command.AddUserOperation;
const RemoveUserOperation = (handlerProto.xray as any).app.proxyman.command.RemoveUserOperation;

export interface TrafficData {
  tx: number;
  rx: number;
}

export class XrayClient {
  private handler: any;
  private stats: any;

  constructor(host: string, port: number) {
    const address = `${host}:${port}`;
    const creds = grpc.credentials.createInsecure();
    this.handler = new HandlerService(address, creds);
    this.stats = new StatsService(address, creds);
  }

  /**
   * Add a Trojan user to an inbound.
   * @param inboundTag - Xray inbound tag (e.g. "trojan-in")
   * @param email - User identifier (TunPilot username)
   * @param password - Trojan password
   */
  addUser(inboundTag: string, email: string, password: string): Promise<void> {
    // Serialize the Trojan account
    const accountMsg = TrojanAccount.encode({ password }).finish();

    // Build the AddUserOperation with the User containing the account
    const addUserOp = AddUserOperation.encode({
      user: {
        level: 0,
        email,
        account: {
          type: TROJAN_ACCOUNT_TYPE,
          value: accountMsg,
        },
      },
    }).finish();

    return new Promise((resolve, reject) => {
      this.handler.AlterInbound(
        {
          tag: inboundTag,
          operation: {
            type: ADD_USER_OP_TYPE,
            value: addUserOp,
          },
        },
        (err: grpc.ServiceError | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Remove a user from an inbound by email.
   */
  removeUser(inboundTag: string, email: string): Promise<void> {
    const removeUserOp = RemoveUserOperation.encode({ email }).finish();

    return new Promise((resolve, reject) => {
      this.handler.AlterInbound(
        {
          tag: inboundTag,
          operation: {
            type: REMOVE_USER_OP_TYPE,
            value: removeUserOp,
          },
        },
        (err: grpc.ServiceError | null) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Query per-user traffic stats from Xray.
   * Stats pattern: "user>>>email>>>traffic>>>uplink" / "downlink"
   * @param reset - If true, resets counters after reading (like hy2's clear=1)
   */
  queryTraffic(reset: boolean = true): Promise<Map<string, TrafficData>> {
    return new Promise((resolve, reject) => {
      this.stats.QueryStats(
        { pattern: "user>>>", reset },
        (err: grpc.ServiceError | null, response: any) => {
          if (err) return reject(err);

          const result = new Map<string, TrafficData>();

          for (const stat of response?.stat || []) {
            // Pattern: "user>>>email>>>traffic>>>uplink" or "downlink"
            const parts = (stat.name as string).split(">>>");
            if (parts.length !== 4) continue;

            const email = parts[1]!;
            const direction = parts[3]!;
            const value = Number(stat.value) || 0;

            if (!result.has(email)) {
              result.set(email, { tx: 0, rx: 0 });
            }
            const entry = result.get(email)!;
            if (direction === "uplink") {
              entry.tx = value;
            } else if (direction === "downlink") {
              entry.rx = value;
            }
          }

          resolve(result);
        }
      );
    });
  }

  /**
   * Close the gRPC channels.
   */
  close(): void {
    grpc.closeClient(this.handler);
    grpc.closeClient(this.stats);
  }
}
