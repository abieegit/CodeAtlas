import orderRoutes from "./routes/orders.routes";
import { app } from "express";

app.use("/api", orderRoutes);

app.listen(5000);
