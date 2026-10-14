import { Router } from "express";

import {
    getAnalysisReport,
    getFunctionSummary
} from "../controllers/analysis.controller";

const router = Router();

router.get("/analysis", getAnalysisReport);

router.get("/analysis/function", getFunctionSummary);

export default router;
