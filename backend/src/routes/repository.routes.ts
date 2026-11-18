import { Router } from "express";
import multer from "multer";

import {
    analyzeRepositoryUpload,
    getGraph,
    getRepositories,
    health
} from "../controllers/repository.controller";

import { env } from "../config/env";

import { requireAuth } from "../middleware/auth.middleware";
import { requireOwnedRepository } from "../middleware/ownership.middleware";

import { ensureDirectory } from "../utils/file.utils";

ensureDirectory(env.uploadsDir);

const upload = multer({
    dest: env.uploadsDir,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

const router = Router();

/* Health stays public; everything else requires a verified token. */
router.get("/health", health);

router.get("/repositories", requireAuth, getRepositories);

router.get("/graph", requireAuth, requireOwnedRepository, getGraph);

router.post(
    "/repositories/analyze",
    requireAuth,
    upload.single("file"),
    analyzeRepositoryUpload
);

export default router;
