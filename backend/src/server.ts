import cors from "cors";
import express, {
    NextFunction,
    Request,
    Response
} from "express";

import { env } from "./config/env";

import {
    ensureDirectory,
    removeDirectoryIfExists
} from "./utils/file.utils";

import repositoryRoutes from "./routes/repository.routes";
import analysisRoutes from "./routes/analysis.routes";
import workflowRoutes from "./routes/workflow.routes";
import authRoutes from "./routes/auth.routes";

import { assertSupabaseConfigured } from "./database/supabase";

/*
 * Best-effort startup hygiene: clear extraction directories left behind by
 * previous runs unless the operator opted out with KEEP_EXTRACTED=true.
 * (Uploaded archives live in uploadsDir, not here, so nothing pending is
 * removed.)
 */
if (!env.keepExtracted) {
    removeDirectoryIfExists(env.extractedDir);
    ensureDirectory(env.extractedDir);
}

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", repositoryRoutes);
app.use("/api", analysisRoutes);
app.use("/api", workflowRoutes);
app.use("/api", authRoutes);

app.use(
    (_request: Request, response: Response) => {
        response.status(404).json({
            error: "Not found"
        });
    }
);

app.use(
    (
        error: Error,
        _request: Request,
        response: Response,
        _next: NextFunction
    ) => {
        console.error("[server]", error);
        response.status(500).json({
            error: error.message ?? "Internal server error"
        });
    }
);

if (require.main === module) {

    /* Fail fast when Supabase is not configured (Build 06). */
    assertSupabaseConfigured();

    app.listen(env.port, () => {
        console.log(
            `[server] CodeAtlas API listening on http://localhost:${env.port}`
        );
    });
}
