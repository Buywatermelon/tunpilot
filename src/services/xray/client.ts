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

// gRPC generated service constructor — dynamic proto loading doesn't provide static types
const StatsService = (statsProto as Record<string, Record<string, unknown>>).xray.app.stats.command
  .StatsService as grpc.ServiceClientConstructor;

const GRPC_TIMEOUT = 15_000; // ms

export interface TrafficData {
  tx: number;
  rx: number;
}

interface StatEntry {
  name: string;
  value: number;
}

interface QueryStatsResponse {
  stat?: StatEntry[];
}

/**
 * Xray stats client — queries per-user traffic via gRPC StatsService.
 */
export class XrayClient {
  private stats: grpc.Client;

  constructor(host: string, port: number) {
    const address = `${host}:${port}`;
    const creds = grpc.credentials.createInsecure();
    this.stats = new StatsService(address, creds);
  }

  queryTraffic(reset: boolean = true): Promise<Map<string, TrafficData>> {
    const deadline = new Date(Date.now() + GRPC_TIMEOUT);

    return new Promise((resolve, reject) => {
      (this.stats as grpc.Client & Record<string, Function>).QueryStats(
        { pattern: "user>>>", reset },
        { deadline },
        (err: grpc.ServiceError | null, response: QueryStatsResponse) => {
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
        },
      );
    });
  }

  close(): void {
    grpc.closeClient(this.stats);
  }
}
