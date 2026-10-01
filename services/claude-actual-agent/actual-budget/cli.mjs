#!/usr/bin/env node
// Minimal CLI wrapper around @actual-app/api, driven by env vars from .env
// (load with `node --env-file=.env cli.mjs <command>`).
//
// Commands:
//   list-budgets              List budgets visible to this server login (to find ACTUAL_SYNC_ID)
//   accounts                  Dump all accounts as JSON
//   categories                Dump category groups (with nested categories) as JSON
//   payees                    Dump all payees as JSON
//   eval "<js body>"          Run an async function body with `api`, `q`, `runQuery` in scope.
//                             Must end with an explicit `return`, e.g.:
//                             eval "return await api.getAccounts();"
//
// Every command except list-budgets requires ACTUAL_SYNC_ID to be set.

import * as api from "@actual-app/api";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "budget-cache");
fs.mkdirSync(dataDir, { recursive: true });

const {
  ACTUAL_SERVER_URL,
  ACTUAL_PASSWORD,
  ACTUAL_SYNC_ID,
  ACTUAL_E2E_PASSWORD,
} = process.env;

if (!ACTUAL_SERVER_URL || !ACTUAL_PASSWORD) {
  console.error(
    "Missing ACTUAL_SERVER_URL or ACTUAL_PASSWORD. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;

  await api.init({
    dataDir,
    serverURL: ACTUAL_SERVER_URL,
    password: ACTUAL_PASSWORD,
    verbose: false,
  });

  try {
    if (cmd === "list-budgets") {
      console.log(JSON.stringify(await api.getBudgets(), null, 2));
      return;
    }

    if (!ACTUAL_SYNC_ID) {
      console.error(
        "Missing ACTUAL_SYNC_ID in .env. Run `list-budgets` first to find it.",
      );
      process.exitCode = 1;
      return;
    }

    await api.downloadBudget(
      ACTUAL_SYNC_ID,
      ACTUAL_E2E_PASSWORD ? { password: ACTUAL_E2E_PASSWORD } : undefined,
    );

    switch (cmd) {
      case "accounts":
        console.log(JSON.stringify(await api.getAccounts(), null, 2));
        break;
      case "categories":
        console.log(JSON.stringify(await api.getCategoryGroups(), null, 2));
        break;
      case "payees":
        console.log(JSON.stringify(await api.getPayees(), null, 2));
        break;
      case "eval": {
        let body = rest.join(" ");
        if (body.startsWith("@")) {
          body = fs.readFileSync(body.slice(1), "utf8");
        }
        if (!body.trim()) {
          throw new Error(
            'Usage: eval "<async js body ending in return>" (or eval @path/to/script.js for longer code), e.g. eval "return await api.getAccounts();"',
          );
        }
        const { q, runQuery } = api;
        const fn = new Function(
          "api",
          "q",
          "runQuery",
          `return (async () => { ${body} })();`,
        );
        console.log(JSON.stringify(await fn(api, q, runQuery), null, 2));
        break;
      }
      default:
        console.error(
          `Unknown command: ${cmd}\nAvailable: list-budgets, accounts, categories, payees, eval "<code>"`,
        );
        process.exitCode = 1;
    }
  } finally {
    await api.shutdown();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
