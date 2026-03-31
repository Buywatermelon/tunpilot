import { describe, it, expect, afterEach } from "bun:test";
import { loadConfig, saveConfig, getConfigValue, setConfigValue } from "./config";
import { unlinkSync } from "fs";

const TEST_PATH = "/tmp/tunpilot-config-test.json";

afterEach(() => {
  try { unlinkSync(TEST_PATH); } catch {}
});

describe("config", () => {
  it("reads empty config when file does not exist", () => {
    process.env.TUNPILOT_CONFIG_PATH = "/tmp/tunpilot-config-nonexistent-" + Date.now() + ".json";
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it("write and read config roundtrip", () => {
    process.env.TUNPILOT_CONFIG_PATH = TEST_PATH;
    saveConfig({ server: "http://example.com:3000", token: "abc123" });
    const config = loadConfig();
    expect(config.server).toBe("http://example.com:3000");
    expect(config.token).toBe("abc123");
  });

  it("set and get individual values", () => {
    process.env.TUNPILOT_CONFIG_PATH = TEST_PATH;
    saveConfig({});
    setConfigValue("server", "http://localhost:9999");
    setConfigValue("token", "mytoken");
    expect(getConfigValue("server")).toBe("http://localhost:9999");
    expect(getConfigValue("token")).toBe("mytoken");
  });

  it("respects TUNPILOT_CONFIG_PATH environment variable", () => {
    const customPath = "/tmp/tunpilot-config-custom-test.json";
    process.env.TUNPILOT_CONFIG_PATH = customPath;
    saveConfig({ server: "http://custom.test" });
    const config = loadConfig();
    expect(config.server).toBe("http://custom.test");
    try { unlinkSync(customPath); } catch {}
  });
});
