import neo4j, {
    Driver
} from "neo4j-driver";

import { env } from "../config/env";

export const neo4jDriver: Driver =
    neo4j.driver(
        env.neo4j.uri,
        neo4j.auth.basic(
            env.neo4j.username,
            env.neo4j.password
        ),
        {
            /*
             * Return integers as plain JS numbers so line numbers
             * serialize cleanly through the REST API.
             */
            disableLosslessIntegers: true
        }
    );

export const database = env.neo4j.database;
