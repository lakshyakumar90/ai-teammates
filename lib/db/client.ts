import { neon } from "@neondatabase/serverless"
import { drizzle } from "drizzle-orm/neon-http"
import * as schema from "./schema"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required. Set your Neon pooled URL in .env.local."
  )
}

// Shared by the Next.js server and the Trigger.dev worker.
export const db = drizzle(neon(databaseUrl), { schema })
