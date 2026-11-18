import * as fs from "fs";

import type { Readable } from "stream";

import {
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    S3Client
} from "@aws-sdk/client-s3";

import { env } from "../config/env";

/*
 * Cloudflare R2 object storage (Build 07) — S3-compatible and PRIVATE.
 *
 * Server-side only: the credentials never reach the browser, no public URL is
 * ever produced, and object keys are always derived from authenticated UUIDs
 * (never from client input). The client is created lazily.
 */

let client: S3Client | null = null;

function r2Client(): S3Client {
    if (!client) {
        client = new S3Client({
            region: "auto",
            endpoint: env.r2.endpoint || "http://localhost:9000",
            credentials: {
                accessKeyId: env.r2.accessKeyId || "not-configured",
                secretAccessKey: env.r2.secretAccessKey || "not-configured"
            }
        });
    }
    return client;
}

/** True when every required R2 variable is present. */
export function isR2Configured(): boolean {
    return Boolean(
        env.r2.accountId &&
            env.r2.accessKeyId &&
            env.r2.secretAccessKey &&
            env.r2.bucketName &&
            env.r2.endpoint
    );
}

/** Throws with a clear message when R2 is not configured. */
export function assertR2Configured(): void {

    const missing = [
        ["R2_ACCOUNT_ID", env.r2.accountId],
        ["R2_ACCESS_KEY_ID", env.r2.accessKeyId],
        ["R2_SECRET_ACCESS_KEY", env.r2.secretAccessKey],
        ["R2_BUCKET_NAME", env.r2.bucketName],
        ["R2_ENDPOINT", env.r2.endpoint]
    ]
        .filter(([, value]) => !value)
        .map(([name]) => name);

    if (missing.length > 0) {
        throw new Error(
            `R2 object storage is not configured. Missing: ${missing.join(", ")}. ` +
                "Set them in backend/.env (copy backend/.env.example) — see the " +
                "Build 07 log for the Cloudflare setup."
        );
    }
}

/**
 * The one canonical object key for a repository's source ZIP. Derived from
 * UUIDs, never from the user-supplied filename.
 */
export function objectKeyFor(userId: string, repositoryId: string): string {
    return `repositories/${userId}/${repositoryId}/source.zip`;
}

/** Uploads a local ZIP file to the private bucket. */
export async function putZip(
    objectKey: string,
    filePath: string
): Promise<void> {

    await r2Client().send(
        new PutObjectCommand({
            Bucket: env.r2.bucketName,
            Key: objectKey,
            Body: fs.createReadStream(filePath),
            ContentType: "application/zip"
        })
    );
}

/** Opens a readable stream for a stored ZIP (used by the worker). */
export async function getZipStream(
    objectKey: string
): Promise<Readable> {

    const result = await r2Client().send(
        new GetObjectCommand({
            Bucket: env.r2.bucketName,
            Key: objectKey
        })
    );

    if (!result.Body) {
        throw new Error("R2 returned an empty object body.");
    }

    return result.Body as unknown as Readable;
}

/** Best-effort delete, used to clean up an orphaned object on failure. */
export async function deleteObject(objectKey: string): Promise<void> {

    await r2Client().send(
        new DeleteObjectCommand({
            Bucket: env.r2.bucketName,
            Key: objectKey
        })
    );
}
