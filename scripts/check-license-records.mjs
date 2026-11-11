import { createPostgresStore } from "../server/postgres.js";
import { databaseUrl } from "../server/runtime.js";

const url = databaseUrl(process.env);
if (!url) {
  console.log("database=missing");
  process.exit(2);
}

const store = createPostgresStore(url);
const probe = `schema-${Date.now().toString(36)}`;
try {
  await store.writeProbe(probe);
  const seen = await store.readProbe(probe);
  await store.deleteProbe(probe);
  const gone = await store.readProbe(probe);
  console.log(`probe=${seen === true && gone === false}`);
  const summary = await store.recordSummary();
  for (const [name, count] of Object.entries(summary)) console.log(`${name}=${count}`);
} catch (error) {
  const message = error instanceof Error ? error.message : "database-error";
  console.log(`database_error=${message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]").slice(0, 120)}`);
  process.exit(1);
}
