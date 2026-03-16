import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { join } from "node:path";

const PROTO_DIR = join(import.meta.dir, "proto");

const statsDef = protoLoader.loadSync(join(PROTO_DIR, "stats.proto"), {
  keepCase: false,
  longs: Number,
  enums: String,
  defaults: true,
  oneofs: true,
});
const statsProto = grpc.loadPackageDefinition(statsDef);

const StatsService = (statsProto.xray as any).app.stats.command.StatsService;

export interface TrafficData {
  tx: number;
  rx: number;
}

/**
 * Xray stats client — queries per-user traffic via gRPC StatsService.
 * User management is handled via config file (not gRPC HandlerService).
 */
export class XrayClient {
  private stats: any;

  constructor(host: string, port: number) {
    const address = `${host}:${port}`;
    const creds = grpc.credentials.createInsecure();
    this.stats = new StatsService(address, creds);
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

  /** Close the gRPC channel. */
  close(): void {
    grpc.closeClient(this.stats);
  }
}
