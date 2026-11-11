import { randomBytes } from "node:crypto";
import { createPostgresStore } from "../server/postgres.js";
import { databaseUrl } from "../server/runtime.js";

const url = databaseUrl(process.env);
if (!url) {
  console.log("database=missing");
  process.exit(2);
}

const id = `probe-${randomBytes(8).toString("hex")}`;
const first = createPostgresStore(url);
const second = createPostgresStore(url);
await first.writeProbe(id);
const seen = await second.readProbe(id);
await second.deleteProbe(id);
const gone = await first.readProbe(id);
console.log(`persisted=${seen === true}`);
console.log(`deleted=${gone === false}`);
if (!seen || gone) process.exit(1);
