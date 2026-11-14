import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma CLI operations (migrations, introspection) use the direct Neon URL.
// The application runtime uses DATABASE_URL (pooled) through the pg adapter.
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
