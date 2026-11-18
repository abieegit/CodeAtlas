import { Router } from "express";

import {
    getAnalysisReport,
    getFunctionSummary
} from "../controllers/analysis.controller";

import { requireAuth } from "../middleware/auth.middleware";
import { requireOwnedRepository } from "../middleware/ownership.middleware";

const router = Router();

router.get(
    "/analysis",
    requireAuth,
    requireOwnedRepository,
    getAnalysisReport
);

router.get(
    "/analysis/function",
    requireAuth,
    requireOwnedRepository,
    getFunctionSummary
);

export default router;
