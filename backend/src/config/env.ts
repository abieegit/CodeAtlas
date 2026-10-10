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
    )
};
