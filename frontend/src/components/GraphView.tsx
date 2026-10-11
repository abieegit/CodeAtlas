import * as d3 from "d3";
import { useEffect, useRef } from "react";

import { TYPE_COLORS, TYPE_RADIUS } from "../nodeStyles";
import type { GraphData, GraphNode, RelationshipType } from "../types";

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
    type: RelationshipType;
}

interface Props {
    graph: GraphData;
    selectedId: string | null;
    onSelect: (node: GraphNode | null) => void;
}

export default function GraphView({ graph, selectedId, onSelect }: Props) {

    const svgRef = useRef<SVGSVGElement | null>(null);

    const nodeSelection = useRef<d3.Selection<
        SVGGElement,
        SimNode,
        SVGGElement,
        unknown
    > | null>(null);

    const linkSelection = useRef<d3.Selection<
        SVGLineElement,
        SimLink,
        SVGGElement,
        unknown
    > | null>(null);

    /*
     * Build the force simulation whenever the graph changes.
     */
    useEffect(() => {

        const svgElement = svgRef.current;

        if (!svgElement) {
            return;
        }

        const svg = d3.select(svgElement);
        svg.selectAll("*").remove();

        const width = svgElement.clientWidth || 900;
        const height = svgElement.clientHeight || 640;

        const container = svg.append("g");

        const zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .scaleExtent([0.15, 4])
            .on("zoom", (event) => {
                container.attr("transform", event.transform.toString());
            });

        svg.call(zoom);

        svg.append("defs")
            .append("marker")
            .attr("id", "codeatlas-arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 18)
            .attr("refY", 0)
            .attr("markerWidth", 5)
            .attr("markerHeight", 5)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#475569");

        const nodes: SimNode[] = graph.nodes.map((node) => ({ ...node }));

        const links: SimLink[] = graph.relationships.map(
            (relationship) => ({
                source: relationship.source,
                target: relationship.target,
                type: relationship.type
            })
        );

        const link = container
            .append("g")
            .attr("stroke", "#334155")
            .selectAll<SVGLineElement, SimLink>("line")
            .data(links)
            .join("line")
            .attr("stroke-width", 1)
            .attr("marker-end", "url(#codeatlas-arrow)");

        const node = container
            .append("g")
            .selectAll<SVGGElement, SimNode>("g")
            .data(nodes)
            .join("g")
            .attr("cursor", "pointer");

        node.append("circle")
            .attr("r", (datum) => TYPE_RADIUS[datum.type] ?? 8)
            .attr("fill", (datum) => TYPE_COLORS[datum.type] ?? "#64748b")
            .attr("stroke", "#0b1220")
            .attr("stroke-width", 1.5);

        node.append("title")
            .text((datum) => `${datum.type}: ${datum.name}`);

        /*
         * On large graphs only the most meaningful node types are
         * labelled, to keep the canvas readable.
         */
        const showAllLabels = nodes.length <= 80;

        const hasLabel = (type: string): boolean =>
            showAllLabels ||
            type === "Repository" ||
            type === "Directory" ||
            type === "Class" ||
            type === "Function";

        node.append("text")
            .text((datum) => (hasLabel(datum.type) ? datum.name : ""))
            .attr("x", 10)
            .attr("y", 4)
            .attr("font-size", 10)
            .attr("fill", "#cbd5e1")
            .attr("stroke", "#0b1220")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke");

        const simulation = d3
            .forceSimulation<SimNode>(nodes)
            .force(
                "link",
                d3
                    .forceLink<SimNode, SimLink>(links)
                    .id((datum) => datum.id)
                    .distance(90)
                    .strength(0.2)
            )
            .force("charge", d3.forceManyBody().strength(-280))
            .force(
                "center",
                d3.forceCenter(width / 2, height / 2)
            )
            .force("collide", d3.forceCollide().radius(24));

        simulation.on("tick", () => {

            link
                .attr("x1", (datum) => (datum.source as SimNode).x ?? 0)
                .attr("y1", (datum) => (datum.source as SimNode).y ?? 0)
                .attr("x2", (datum) => (datum.target as SimNode).x ?? 0)
                .attr("y2", (datum) => (datum.target as SimNode).y ?? 0);

            node.attr(
                "transform",
                (datum) => `translate(${datum.x ?? 0},${datum.y ?? 0})`
            );
        });

        const drag = d3
            .drag<SVGGElement, SimNode>()
            .on("start", (event, datum) => {
                if (!event.active) {
                    simulation.alphaTarget(0.3).restart();
                }
                datum.fx = datum.x;
                datum.fy = datum.y;
            })
            .on("drag", (event, datum) => {
                datum.fx = event.x;
                datum.fy = event.y;
            })
            .on("end", (event, datum) => {
                if (!event.active) {
                    simulation.alphaTarget(0);
                }
                datum.fx = null;
                datum.fy = null;
            });

        node.call(drag);

        node.on("click", (event: MouseEvent, datum) => {
            event.stopPropagation();
            onSelect(datum);
        });

        svg.on("click", () => onSelect(null));

        /*
         * Once the layout settles, fit the whole graph into view so
         * it is centred and fully visible on first render.
         */
        const fitToView = (): void => {

            if (nodes.length === 0) {
                return;
            }

            const xs = nodes.map((datum) => datum.x ?? 0);
            const ys = nodes.map((datum) => datum.y ?? 0);

            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            const padding = 60;
            const graphWidth = Math.max(maxX - minX, 1);
            const graphHeight = Math.max(maxY - minY, 1);

            const scale = Math.min(
                1.5,
                0.9 * Math.min(
                    width / (graphWidth + padding * 2),
                    height / (graphHeight + padding * 2)
                )
            );

            const translateX = width / 2 - scale * (minX + maxX) / 2;
            const translateY = height / 2 - scale * (minY + maxY) / 2;

            svg.transition()
                .duration(500)
                .call(
                    zoom.transform,
                    d3.zoomIdentity
                        .translate(translateX, translateY)
                        .scale(scale)
                );
        };

        simulation.on("end", fitToView);

        nodeSelection.current = node;
        linkSelection.current = link;

        return () => {
            simulation.stop();
        };

    }, [graph, onSelect]);

    /*
     * Highlight the selected node and its direct neighbours.
     */
    useEffect(() => {

        const node = nodeSelection.current;
        const link = linkSelection.current;

        if (!node || !link) {
            return;
        }

        const circle = node.select<SVGCircleElement>("circle");

        if (!selectedId) {
            node.attr("opacity", 1);
            link.attr("opacity", 0.6).attr("stroke-width", 1);
            circle
                .attr("stroke", "#0b1220")
                .attr("stroke-width", 1.5)
                .style("filter", null);
            return;
        }

        const connected = new Set<string>([selectedId]);

        for (const relationship of graph.relationships) {
            if (relationship.source === selectedId) {
                connected.add(relationship.target);
            }
            if (relationship.target === selectedId) {
                connected.add(relationship.source);
            }
        }

        const endpointId = (endpoint: SimLink["source"]): string =>
            typeof endpoint === "string"
                ? endpoint
                : (endpoint as SimNode).id;

        node.attr("opacity", (datum) =>
            connected.has(datum.id) ? 1 : 0.15
        );

        link
            .attr("opacity", (datum) =>
                endpointId(datum.source) === selectedId ||
                endpointId(datum.target) === selectedId
                    ? 1
                    : 0.05
            )
            .attr("stroke-width", (datum) =>
                endpointId(datum.source) === selectedId ||
                endpointId(datum.target) === selectedId
                    ? 2
                    : 1
            );

        circle
            .attr("stroke", (datum) =>
                datum.id === selectedId ? "#22d3ee" : "#0b1220"
            )
            .attr("stroke-width", (datum) =>
                datum.id === selectedId ? 2.5 : 1.5
            )
            .style("filter", (datum) =>
                datum.id === selectedId
                    ? "drop-shadow(0 0 6px rgba(34,211,238,0.9))"
                    : null
            );

    }, [selectedId, graph]);

    return <svg ref={svgRef} className="h-full w-full" />;
}
