import { createHmac, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { chmod, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const renderer = fileURLToPath(new URL("./render-table-placard.py", import.meta.url));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function placardDirectory(output, restaurantId, tableId, tokenVersion) {
  if (
    !uuidPattern.test(restaurantId) ||
    !uuidPattern.test(tableId) ||
    !Number.isSafeInteger(tokenVersion) ||
    tokenVersion < 1
  )
    throw new Error("Invalid placard identity");
  return join(resolve(output), restaurantId, tableId, `v${tokenVersion}`);
}

async function assertNoLegacyPlacards(output) {
  let names;
  try {
    names = await readdir(output);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const found = names.find((name) => /\.(svg|pdf)$/i.test(name));
  if (found)
    throw new Error(
      `Legacy code-only placard ${found} exists in ${output}. Move it out of service and rerun; it may belong to another restaurant.`,
    );
}

export function signProvisionedTable({ restaurantId, tableId, tokenVersion }, secret) {
  if (!secret || secret.length < 32)
    throw new Error("DINE_IN_TABLE_CODE_SECRET is missing or too short");
  const message = `v1.${restaurantId}.${tableId}.${tokenVersion}`;
  return `${message}.${createHmac("sha256", secret).update(message).digest("base64url")}`;
}

export function tableOrderUrl(origin, token) {
  const base = new URL(origin);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("APP_BASE_URL must be a bare HTTPS origin");
  const url = new URL("/order", base);
  url.searchParams.set("table", token);
  return url.toString();
}

function options(args) {
  const command = args.shift();
  const values = {};
  while (args.length) {
    const flag = args.shift();
    if (!flag?.startsWith("--") || !args.length) throw new Error("Invalid table command options");
    values[flag.slice(2)] = args.shift();
  }
  if (
    !["list", "create", "deactivate", "rotate", "render"].includes(command) ||
    !values.restaurant
  ) {
    throw new Error(
      "Usage: tables.mjs list|create|deactivate|rotate|render --restaurant SLUG [--tables T01:Table_1,T02:Table_2] [--code T01] [--out PRIVATE_DIR]",
    );
  }
  return { command, values };
}

export async function renderPlacard({
  table,
  restaurant,
  secret,
  origin,
  output,
  python = "python3",
}) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(table.code))
    throw new Error("Table code is unsafe for filenames");
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const token = signProvisionedTable(
    { restaurantId: restaurant.id, tableId: table.id, tokenVersion: table.token_version },
    secret,
  );
  const input = JSON.stringify({
    restaurant: restaurant.name,
    label: table.label,
    code: table.code,
    url: tableOrderUrl(origin, token),
    output: placardDirectory(output, restaurant.id, table.id, table.token_version),
  });
  await new Promise((accept, reject) => {
    const child = spawn(python, [renderer], { stdio: ["pipe", "ignore", "pipe"] });
    let errorOutput = "";
    child.stderr.on("data", (chunk) => {
      errorOutput = (errorOutput + chunk).slice(0, 1000);
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? accept()
        : reject(
            new Error(
              `Placard renderer failed: ${errorOutput.replace(/v1\.[A-Za-z0-9._-]+/g, "[redacted]")}`,
            ),
          ),
    );
    child.stdin.end(input);
  });
}

export async function runTableCommand(
  argv,
  environment = process.env,
  write = console.log,
  render = renderPlacard,
) {
  const { command, values } = options([...argv]);
  if (!environment.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const needsRender = ["create", "rotate", "render"].includes(command);
  if (
    needsRender &&
    (!environment.DINE_IN_TABLE_CODE_SECRET || environment.DINE_IN_TABLE_CODE_SECRET.length < 32)
  )
    throw new Error("DINE_IN_TABLE_CODE_SECRET must contain at least 32 characters");
  const origin = environment.APP_BASE_URL;
  if (needsRender) tableOrderUrl(origin, "check");
  const output = resolve(values.out ?? "data/table-placards");
  const client = new pg.Client({ connectionString: environment.DATABASE_URL });
  await client.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const restaurantResult = await client.query(
      "SELECT id, name, slug FROM restaurants WHERE slug = $1 FOR UPDATE",
      [values.restaurant],
    );
    const restaurant = restaurantResult.rows[0];
    if (!restaurant) throw new Error("Restaurant not found");
    let tables = [];
    if (command === "create") {
      const entries = (values.tables ?? "")
        .split(",")
        .filter(Boolean)
        .map((part) => {
          const split = part.indexOf(":");
          if (split < 0) throw new Error("Use CODE:Label for each table");
          return { code: part.slice(0, split).trim(), label: part.slice(split + 1).trim() };
        });
      if (!entries.length || entries.length > 100) throw new Error("Supply 1-100 tables");
      for (const entry of entries) {
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(entry.code) || !entry.label || entry.label.length > 80)
          throw new Error("Invalid table code or label");
        const result = await client.query(
          "INSERT INTO restaurant_tables (id, restaurant_id, code, label) VALUES ($1, $2, $3, $4) RETURNING id, code, label, active, token_version",
          [randomUUID(), restaurant.id, entry.code, entry.label],
        );
        tables.push(result.rows[0]);
      }
    } else if (command === "rotate" || command === "deactivate") {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(values.code ?? "")) throw new Error("Set --code");
      const result = await client.query(
        command === "rotate"
          ? "UPDATE restaurant_tables SET token_version = token_version + 1 WHERE restaurant_id = $1 AND code = $2 AND active = true RETURNING id, code, label, active, token_version"
          : "UPDATE restaurant_tables SET active = false WHERE restaurant_id = $1 AND code = $2 RETURNING id, code, label, active, token_version",
        [restaurant.id, values.code],
      );
      if (!result.rows.length) throw new Error("Active table not found");
      tables = result.rows;
    } else {
      const result = await client.query(
        "SELECT id, code, label, active, token_version FROM restaurant_tables WHERE restaurant_id = $1 ORDER BY code",
        [restaurant.id],
      );
      tables = command === "render" ? result.rows.filter((row) => row.active) : result.rows;
    }
    if (needsRender) await assertNoLegacyPlacards(output);
    await client.query("COMMIT");
    committed = true;
    if (needsRender) {
      for (const table of tables) {
        await render({
          table,
          restaurant,
          secret: environment.DINE_IN_TABLE_CODE_SECRET,
          origin,
          output,
          python: environment.PLACARD_PYTHON ?? "python3",
        });
        const latest = await client.query(
          "SELECT active, token_version FROM restaurant_tables WHERE id = $1 AND restaurant_id = $2",
          [table.id, restaurant.id],
        );
        if (
          latest.rows[0]?.active !== true ||
          latest.rows[0]?.token_version !== table.token_version
        ) {
          await rm(placardDirectory(output, restaurant.id, table.id, table.token_version), {
            recursive: true,
            force: true,
          });
          throw new Error(
            `${table.code} changed while rendering; stale files removed. Rerun render.`,
          );
        }
        write(
          `${table.code}: wrote private SVG and PDF placards to ${placardDirectory(output, restaurant.id, table.id, table.token_version)}`,
        );
      }
    } else if (command === "deactivate") {
      for (const table of tables) {
        await rm(join(output, restaurant.id, table.id), { recursive: true, force: true });
        write(
          `${table.code}: deactivated; remove any physical placards and quarantine legacy code-only files`,
        );
      }
    } else {
      for (const table of tables)
        write(
          `${table.code}\t${table.label}\t${table.active ? "active" : "inactive"}\tv${table.token_version}`,
        );
    }
    return tables;
  } catch (error) {
    if (!committed) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runTableCommand(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
