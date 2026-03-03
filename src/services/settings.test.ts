import { describe, test, expect, beforeEach } from "bun:test";
import { initDatabase, type Db } from "../db/index";
import { getSetting, setSetting, deleteSetting, listSettings } from "./settings";

let db: Db;

beforeEach(() => {
  db = initDatabase(":memory:");
});

describe("settings service", () => {
  test("setSetting creates a new setting", () => {
    setSetting(db, "ipinfo_token", "tok_abc123");
    const val = getSetting(db, "ipinfo_token");
    expect(val).toBe("tok_abc123");
  });

  test("setSetting updates existing setting", () => {
    setSetting(db, "ipinfo_token", "old");
    setSetting(db, "ipinfo_token", "new");
    expect(getSetting(db, "ipinfo_token")).toBe("new");
  });

  test("getSetting returns null for missing key", () => {
    expect(getSetting(db, "nonexistent")).toBeNull();
  });

  test("deleteSetting removes a setting", () => {
    setSetting(db, "ipinfo_token", "val");
    deleteSetting(db, "ipinfo_token");
    expect(getSetting(db, "ipinfo_token")).toBeNull();
  });

  test("listSettings returns all settings with masked values", () => {
    setSetting(db, "ipinfo_token", "tok_abcdef123");
    setSetting(db, "ipqs_key", "ab");
    const list = listSettings(db);
    expect(list).toHaveLength(2);
    const ipinfo = list.find(s => s.key === "ipinfo_token")!;
    expect(ipinfo.masked_value).toBe("tok_*********");
    const ipqs = list.find(s => s.key === "ipqs_key")!;
    expect(ipqs.masked_value).toBe("****");
  });
});
