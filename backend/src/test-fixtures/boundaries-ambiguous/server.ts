import listRoutes from "./routes/list.routes";
import { app } from "express";

app.use("/api", listRoutes);
