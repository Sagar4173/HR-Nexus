import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true },
});

try {
  await client.connect();
  const tables = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  const constraints = await client.query(
    "select conname from pg_constraint where conname in ('PolicyVersion_no_overlap','PolicyVersion_effective_range') order by 1",
  );
  const indexes = await client.query(
    "select indexname from pg_indexes where indexname in ('PolicyChunk_fts_idx','Assignment_one_active_per_ticket') order by 1",
  );
  const triggers = await client.query(
    "select tgname, tgenabled from pg_trigger where tgname in ('AuditEvent_append_only') and not tgisinternal order by 1",
  );
  console.log(`tables (${tables.rowCount}): ${tables.rows.map((r) => r.table_name).join(", ")}`);
  console.log(`constraints: ${constraints.rows.map((r) => r.conname).join(", ") || "(none)"}`);
  console.log(`indexes: ${indexes.rows.map((r) => r.indexname).join(", ") || "(none)"}`);
  console.log(
    `triggers: ${triggers.rows.map((r) => `${r.tgname} (enabled=${r.tgenabled})`).join(", ") || "(none)"}`,
  );
} finally {
  await client.end();
}
