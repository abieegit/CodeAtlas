import * as path from "path";

import * as dotenv from "dotenv";

/*
 * Load backend/.env regardless of the current working directory.
 * __dirname is backend/src/config (or backend/dist/config when
 * compiled), so ../../ resolves to the backend root.
 */
dotenv.config({
    path: path.resolve(__dirname, "../../.env")
});

export const env = {
    port: Number(process.env.PORT ?? 5000),
    neo4j: {
        uri: process.env.NEO4J_URI ?? "neo4j://localhost:7687",
        username: process.env.NEO4J_USERNAME ?? "neo4j",
        password: process.env.NEO4J_PASSWORD ?? "",
        database: process.env.NEO4J_DATABASE ?? "neo4j"
    },
    uploadsDir: path.resolve(
        process.env.UPLOADS_DIR ?? "uploads"
    ),
    extractedDir: path.resolve(
        process.env.EXTRACTED_DIR ?? "extracted"
    ),
    keepExtracted: process.env.KEEP_EXTRACTED === "true",
    /*
     * LLM API used by the analysis features (currently Groq,
     * https://console.groq.com — OpenAI-compatible wire). The key lives
     * only in backend/.env — never in source or docs.
     */
    llm: {
        key: process.env.LLM_API_KEY ?? "",
        baseUrl: process.env.LLM_API_BASE_URL ?? "https://api.groq.com/openai/v1",
        model: process.env.LLM_MODEL ?? "openai/gpt-oss-120b",
        timeoutMs: Number(process.env.LLM_API_TIMEOUT_MS ?? 60000)
    },
    /*
     * Supabase (Build 06): Auth user verification plus the PostgreSQL
     * project database (profiles, repositories). The service-role key
     * lives only in the backend and must never reach the browser.
     */
    supabase: {
        url: process.env.SUPABASE_URL ?? "",
        /*
         * Supabase's current API keys: the "Publishable key"
         * (sb_publishable_...) and the "Secret key" (sb_secret_...). The
         * secret key is backend-only. The legacy anon / service_role keys
         * are NOT required.
         */
        publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
        secretKey: process.env.SUPABASE_SECRET_KEY ?? ""
    },
    /*
     * Cloudflare R2 (Build 07): private object storage for uploaded ZIPs.
     * S3-compatible; server-side only — never expose these to the browser.
     */
    r2: {
        accountId: process.env.R2_ACCOUNT_ID ?? "",
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
        bucketName: process.env.R2_BUCKET_NAME ?? "",
        endpoint: process.env.R2_ENDPOINT ?? ""
    },
    /*
     * Asynchronous analysis worker (Build 07).
     */
    worker: {
        pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 3000),
        staleSeconds: Number(process.env.WORKER_STALE_SECONDS ?? 900)
    }
};
