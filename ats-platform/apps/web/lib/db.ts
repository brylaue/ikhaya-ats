/**
 * Database client stub
 *
 * Wire this up with your preferred PostgreSQL driver once you have a database.
 * The search route imports this lazily (`import("@/lib/db").catch(() => null)`)
 * so the app won't crash if DATABASE_URL isn't set — it falls back to mock data.
 *
 * Recommended drivers:
 *   - postgres.js  : https://github.com/porsager/postgres
 *   - Drizzle ORM  : https://orm.drizzle.team
 *   - node-postgres: https://node-postgres.com
 *
 * Example with postgres.js:
 *   import postgres from "postgres";
 *   const sql = postgres(process.env.DATABASE_URL!);
 *   export const db = { searchAll: ... };
 */

import type { Embedding } from "@/lib/embeddings";

export interface SearchRow {
  entity_type: string;
  entity_id:   string;
  label:       string;
  sublabel:    string;
  href:        string;
  similarity:  string | number;
}

export interface DbClient {
  /**
   * Calls the `search_all()` pgvector function defined in migration 002.
   * Returns ranked results across candidates, jobs, and clients.
   */
  searchAll(
    embedding:  Embedding,
    orgId:      string,
    limit:      number,
    threshold:  number
  ): Promise<SearchRow[]>;
}

// Replace this stub with a real db client once DATABASE_URL is set.
// Example:
//
//   import postgres from "postgres";
//   const sql = postgres(process.env.DATABASE_URL!);
//
//   export const db: DbClient = {
//     async searchAll(embedding, orgId, limit, threshold) {
//       return sql`
//         SELECT * FROM search_all(
//           ${JSON.stringify(embedding)}::vector,
//           ${orgId}::uuid,
//           ${limit},
//           ${threshold}
//         )
//       `;
//     },
//   };

export const db: DbClient = {
  async searchAll() {
    throw new Error(
      "db.ts: no database client configured. " +
      "Set DATABASE_URL and implement db.searchAll() in apps/web/lib/db.ts."
    );
  },
};
