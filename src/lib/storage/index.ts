import path from "node:path";
import { getConfig } from "../config";
import { GcpStore } from "./gcp";
import { LocalStore } from "./local";
import type { Store } from "./types";

let store: Store | null = null;

export function getStore(): Store {
  if (!store) {
    const cfg = getConfig();
    store = cfg.storage === "gcp" ? new GcpStore(cfg) : new LocalStore(path.resolve(cfg.dataDir));
  }
  return store;
}

/** Test hook. */
export function setStore(s: Store | null) {
  store = s;
}

export type { Store };
