import { Router } from "express";

import {
    getWorkflow,
    listWorkflows,
    postWorkflowRefinement
} from "../controllers/workflow.controller";

import { requireAuth } from "../middleware/auth.middleware";
import { requireOwnedRepository } from "../middleware/ownership.middleware";

const router = Router();

/* Build 05 — Coremation. Additive: no existing route changed. */
router.get("/workflows", requireAuth, requireOwnedRepository, listWorkflows);
router.get(
    "/workflows/:workflowId",
    requireAuth,
    requireOwnedRepository,
    getWorkflow
);
router.post(
    "/workflows/:workflowId/refine",
    requireAuth,
    requireOwnedRepository,
    postWorkflowRefinement
);

export default router;
