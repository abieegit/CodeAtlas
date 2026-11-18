import { Router } from "express";

import { first, second } from "../controllers/list.controller";

const router = Router();

router.get("/things/:id", first);
router.get("/things/:other", second);

export default router;
