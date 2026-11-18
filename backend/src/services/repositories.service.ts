import { supabaseAdmin } from "../database/supabase";

export type RepositoryStatus = "analyzing" | "completed" | "failed";

export interface RepositoryRecord {
    id: string;
    user_id: string;
    name: string;
    source_type: string;
    status: RepositoryStatus;
    graph_persisted: boolean;
    node_count: number;
    relationship_count: number;
    /** Private R2 object key of the source ZIP (Build 07). */
    source_object_key: string | null;
    created_at: string;
    updated_at: string;
}

/*
 * Repository records (Build 06).
 *
 * Every function goes through the service-role client, which bypasses RLS,
 * so each statement is explicitly scoped by the authenticated user id. The
 * repository id is the stable, globally unique identifier used as the graph
 * and cache scoping key; the name is display only.
 */

export async function createRepository(
    userId: string,
    name: string
): Promise<RepositoryRecord> {

    const { data, error } = await supabaseAdmin
        .from("repositories")
        .insert({
            user_id: userId,
            name,
            source_type: "zip",
            status: "analyzing"
        })
        .select("*")
        .single();

    if (error || !data) {
        throw new Error(
            `Could not create the repository record: ${error?.message ?? "unknown error"}`
        );
    }

    return data as RepositoryRecord;
}

export async function findRepositoryForUser(
    repositoryId: string,
    userId: string
): Promise<RepositoryRecord | null> {

    const { data, error } = await supabaseAdmin
        .from("repositories")
        .select("*")
        .eq("id", repositoryId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        throw new Error(`Could not read the repository record: ${error.message}`);
    }

    return (data as RepositoryRecord | null) ?? null;
}

export async function listRepositoriesForUser(
    userId: string
): Promise<RepositoryRecord[]> {

    const { data, error } = await supabaseAdmin
        .from("repositories")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`Could not list the repositories: ${error.message}`);
    }

    return (data ?? []) as RepositoryRecord[];
}

export interface RepositoryOutcome {
    status: RepositoryStatus;
    graphPersisted?: boolean;
    nodeCount?: number;
    relationshipCount?: number;
}

export async function updateRepositoryOutcome(
    repositoryId: string,
    userId: string,
    outcome: RepositoryOutcome
): Promise<void> {

    const patch: Record<string, unknown> = { status: outcome.status };

    if (outcome.graphPersisted !== undefined) {
        patch.graph_persisted = outcome.graphPersisted;
    }
    if (outcome.nodeCount !== undefined) {
        patch.node_count = outcome.nodeCount;
    }
    if (outcome.relationshipCount !== undefined) {
        patch.relationship_count = outcome.relationshipCount;
    }

    const { error } = await supabaseAdmin
        .from("repositories")
        .update(patch)
        .eq("id", repositoryId)
        .eq("user_id", userId);

    if (error) {
        throw new Error(`Could not update the repository record: ${error.message}`);
    }
}

/**
 * Records the private R2 object key of a repository's source ZIP (Build 07).
 */
export async function setRepositorySourceKey(
    repositoryId: string,
    userId: string,
    objectKey: string
): Promise<void> {

    const { error } = await supabaseAdmin
        .from("repositories")
        .update({ source_object_key: objectKey })
        .eq("id", repositoryId)
        .eq("user_id", userId);

    if (error) {
        throw new Error(`Could not store the source object key: ${error.message}`);
    }
}

/**
 * Deletes a repository the caller owns. Used to roll back an upload that never
 * reached storage (or whose job could not be created). Cascades to any job.
 */
export async function deleteRepository(
    repositoryId: string,
    userId: string
): Promise<void> {

    const { error } = await supabaseAdmin
        .from("repositories")
        .delete()
        .eq("id", repositoryId)
        .eq("user_id", userId);

    if (error) {
        throw new Error(`Could not delete the repository record: ${error.message}`);
    }
}
