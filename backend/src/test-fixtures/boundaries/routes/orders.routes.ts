import { Router } from "express";

import { createOrder, getOrder } from "../controllers/orders.controller";

const router = Router();

router.get("/orders/:id", getOrder);
router.post("/orders", createOrder);

export default router;
