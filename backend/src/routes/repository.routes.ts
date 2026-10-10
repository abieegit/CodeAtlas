import { Router } from "express";
import multer from "multer";

import {
    analyzeRepositoryUpload,
    getGraph,
    getRepositories,
    health
} from "../controllers/repository.controller";

import { env } from "../config/env";

import { ensureDirectory } from "../utils/file.utils";

ensureDirectory(env.uploadsDir);

const upload = multer({
    dest: env.uploadsDir,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

const router = Router();

router.get("/health", health);

router.get("/repositories", getRepositories);

router.get("/graph", getGraph);

router.post(
    "/repositories/analyze",
    upload.single("file"),
    analyzeRepositoryUpload
);

export default router;
