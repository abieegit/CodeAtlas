import { useMemo } from "react";

import type {
    GraphData,
    GraphNode,
    RelationshipEvidence
} from "../types";

interface Props {
    graph: GraphData | null;
    node: GraphNode | null;
    onSelect: (node: GraphNode | null) => void;
}

function Row({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="flex justify-between gap-2">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="max-w-[60%] truncate text-right text-white">
                {String(value)}
            </dd>
        </div>
    );
}

export default function DetailsPanel({ graph, node, onSelect }: Props) {

    const related = useMemo(() => {

        if (!graph || !node) {
            return { outgoing: [], incoming: [] };
        }

        const byId = new Map(
            graph.nodes.map((entry) => [entry.id, entry])
        );

        const outgoing = graph.relationships
            .filter((relationship) => relationship.source === node.id)
            .map((relationship) => ({
                type: relationship.type,
                evidence: relationship.evidence,
                node: byId.get(relationship.target)
            }));

        const incoming = graph.relationships
            .filter((relationship) => relationship.target === node.id)
            .map((relationship) => ({
                type: relationship.type,
                evidence: relationship.evidence,
                node: byId.get(relationship.source)
            }));

        return { outgoing, incoming };

    }, [graph, node]);

    if (!node) {
        return (
            <p className="text-sm text-neutral-500">
                Click a node to see its details and relationships.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-base font-semibold text-white">
                    {node.name}
                </h2>
                <p className="text-xs text-neutral-500">{node.id}</p>
            </div>

            <dl className="space-y-1 text-xs">
                <Row label="Type" value={node.type} />
                {node.category && (
                    <Row label="Category" value={node.category} />
                )}
                <Row label="File" value={node.filePath || "-"} />
                <Row label="Start line" value={node.startLine} />
                <Row label="End line" value={node.endLine} />
            </dl>

            <Related
                title={`Outgoing (${related.outgoing.length})`}
                items={related.outgoing}
                onSelect={onSelect}
            />

            <Related
                title={`Incoming (${related.incoming.length})`}
                items={related.incoming}
                onSelect={onSelect}
            />
        </div>
    );
}

interface RelatedItem {
    type: string;
    node?: GraphNode;
    evidence?: RelationshipEvidence;
}

function Related({
    title,
    items,
    onSelect
}: {
    title: string;
    items: RelatedItem[];
    onSelect: (node: GraphNode | null) => void;
}) {

    if (items.length === 0) {
        return (
            <div>
                <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                    {title}
                </h3>
                <p className="text-xs text-neutral-500">None</p>
            </div>
        );
    }

    return (
        <div>
            <h3 className="mb-1 text-xs font-semibold uppercase text-neutral-500">
                {title}
            </h3>
            <ul className="space-y-1">
                {items.map((item, index) => (
                    <li key={`${item.type}-${item.node?.id ?? index}`}>
                        <button
                            className="w-full rounded px-2 py-1 text-left text-xs hover:bg-neutral-950"
                            onClick={() => onSelect(item.node ?? null)}
                        >
                            <span className="mr-1 rounded bg-neutral-950 px-1 text-[10px] font-medium text-white">
                                {item.type}
                            </span>
                            <span className="text-white">
                                {item.node?.name ?? "unknown"}
                            </span>
                            {item.evidence && (
                                <span className="ml-1 text-[10px] text-neutral-500">
                                    {item.evidence.resolution}
                                    {item.evidence.line !== undefined
                                        ? ` \u00b7 L${item.evidence.line}`
                                        : ""}
                                </span>
                            )}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
