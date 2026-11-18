import { Router } from "express";

import { getMe } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

/* Build 06 — authentication. Additive: no existing route changed. */
router.get("/auth/me", requireAuth, getMe);

export default router;
