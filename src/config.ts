import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_ENGINE = "https://api.hads.dev";

export type Config = { token?: string; engine?: string; email?: string };

export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "hads");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function readConfig(): Config {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as Config;
  } catch {
    return {};
  }
}

/** Written with 0600: the file holds an access token. */
export function writeConfig(config: Config): void {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  chmodSync(configPath(), 0o600);
}

export function clearConfig(): void {
  if (existsSync(configPath())) rmSync(configPath());
}

/** Flags win over the environment, the environment over the config file. */
export function resolve(opts: { token?: string; engine?: string } = {}) {
  const file = readConfig();
  const engine = (opts.engine || process.env.HADS_ENGINE_URL || file.engine || DEFAULT_ENGINE).replace(/\/+$/, "");
  const token = opts.token || process.env.HADS_TOKEN || file.token;
  return { engine, token, email: file.email };
}
