import { config } from "dotenv";
import {
    analyzeRepository
} from "./services/analysis.service";

config();

const repositoryPath =
    "src/test-project";

const graph =
    analyzeRepository(
        repositoryPath
    );

console.log(
    "\nFINAL GRAPH:"
);

console.log(
    JSON.stringify(
        graph,
        null,
        2
    )
);