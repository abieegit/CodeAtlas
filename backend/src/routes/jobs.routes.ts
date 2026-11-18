import { Router } from "express";

import {
    getJob,
    listJobs,
    retryJob
} from "../controllers/jobs.controller";

import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/* Build 07 — analysis jobs. Additive: no existing route changed. */
router.get("/jobs", requireAuth, listJobs);
router.get("/jobs/:jobId", requireAuth, getJob);
router.post("/jobs/:jobId/retry", requireAuth, retryJob);

export default router;
