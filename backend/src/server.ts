import cors from "cors";
import express, {
    NextFunction,
    Request,
    Response
} from "express";

import { env } from "./config/env";

import repositoryRoutes from "./routes/repository.routes";

export const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", repositoryRoutes);

app.use(
    (_request: Request, response: Response) => {
        response.status(404).json({
            error: "Not found"
        });
    }
);

app.use(
    (
        error: Error,
        _request: Request,
        response: Response,
        _next: NextFunction
    ) => {
        console.error("[server]", error);
        response.status(500).json({
            error: error.message ?? "Internal server error"
        });
    }
);

if (require.main === module) {
    app.listen(env.port, () => {
        console.log(
            `[server] CodeAtlas API listening on http://localhost:${env.port}`
        );
    });
}
