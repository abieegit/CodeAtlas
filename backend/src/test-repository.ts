import {
    findSourceFiles
} from "./services/repository.service";

const repositoryPath =
    "src/test-project";

const files =
    findSourceFiles(
        repositoryPath
    );

console.log(
    "\nSOURCE FILES:"
);

console.log(
    JSON.stringify(
        files,
        null,
        2
    )
);