import * as d3 from "d3";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import {
    fitTransformForGraph,
    recordPositions,
    seedPositions,
    PositionMap
} from "../graphLayout";
import { TYPE_COLORS, TYPE_RADIUS } from "../nodeStyles";
import type { GraphData, GraphNode, RelationshipType } from "../types";

export interface GraphViewHandle {
    /** Fit the whole graph into the viewport (explicit user action). */
    fitToView: () => void;
    /**
     * Centre the viewport on a node without touching the simulation.
     * If the node is not rendered yet (e.g. filters were just changed to
     * reveal it) the reveal is applied as soon as the node exists.
     */
    revealNode: (nodeId: string) => void;
}

interface SimNode extends GraphNode, d3.SimulationNodeDatum {}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
    type: RelationshipType;
}

interface Props {
    graph: GraphData;
    selectedId: string | null;
    onSelect: (node: GraphNode | null) => void;
    /**
     * Identity of the loaded layout (e.g. repository name). A new value
     * starts a fresh layout (new coordinates, one auto-fit); the same
     * value keeps coordinates and the current viewport across re-renders.
     */
    layoutKey: string;
}

const GraphView = forwardRef<GraphViewHandle, Props>(function GraphView(
    { graph, selectedId, onSelect, layoutKey },
    ref
) {

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

    const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(
        null
    );

    const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);

    const simNodesRef = useRef<SimNode[]>([]);

    const layoutKeyRef = useRef<string | null>(null);

    const interactedRef = useRef(false);

    const positionsRef = useRef<PositionMap>(new Map());

    const pendingRevealRef = useRef<string | null>(null);

    const setTransform = (next: d3.ZoomTransform, animate: boolean): void => {

        const svgElement = svgRef.current;
        const zoom = zoomRef.current;

        if (!svgElement || !zoom) {
            return;
        }

        const svg = d3.select(svgElement);

        if (animate) {
            svg.transition().duration(500).call(zoom.transform, next);
        } else {
            svg.call(zoom.transform, next);
        }
    };

    const fitToView = (animate: boolean): void => {

        const svgElement = svgRef.current;

        if (!svgElement) {
            return;
        }

        const width = svgElement.clientWidth || 900;
        const height = svgElement.clientHeight || 640;

        const fit = fitTransformForGraph(simNodesRef.current, width, height);

        if (fit) {
            setTransform(
                d3.zoomIdentity.translate(fit.x, fit.y).scale(fit.k),
                animate
            );
        }
    };

    const applyReveal = (): void => {

        const nodeId = pendingRevealRef.current;

        if (!nodeId) {
            return;
        }

        const node = simNodesRef.current.find((entry) => entry.id === nodeId);

        if (!node || node.x === undefined || node.y === undefined) {
            return;
        }

        const svgElement = svgRef.current;

        if (!svgElement) {
            return;
        }

        pendingRevealRef.current = null;

        const width = svgElement.clientWidth || 900;
        const height = svgElement.clientHeight || 640;
        const current = transformRef.current;
        const k = Math.min(Math.max(current.k, 1), 4);

        setTransform(
            d3.zoomIdentity
                .translate(width / 2 - k * node.x, height / 2 - k * node.y)
                .scale(k),
            true
        );
    };

    useImperativeHandle(ref, () => ({
        fitToView: () => fitToView(true),
        revealNode: (nodeId: string) => {
            pendingRevealRef.current = nodeId;
            applyReveal();
        }
    }));

    /*
     * Build the force simulation whenever the graph or layout changes.
     */
    useEffect(() => {

        const svgElement = svgRef.current;

        if (!svgElement) {
            return;
        }

        const isNewLayout = layoutKeyRef.current !== layoutKey;

        layoutKeyRef.current = layoutKey;

        if (isNewLayout) {
            positionsRef.current.clear();
            transformRef.current = d3.zoomIdentity;
            interactedRef.current = false;
        }

        const svg = d3.select(svgElement);
        svg.selectAll("*").remove();

        const width = svgElement.clientWidth || 900;
        const height = svgElement.clientHeight || 640;

        const container = svg.append("g");

        const zoom = d3
            .zoom<SVGSVGElement, unknown>()
            .extent(() => {
                const element = svgRef.current;
                return [
                    [0, 0],
                    [element?.clientWidth || 900, element?.clientHeight || 640]
                ];
            })
            .scaleExtent([0.15, 4])
            .on("zoom", (event) => {
                container.attr("transform", event.transform.toString());
                transformRef.current = event.transform;
            });

        zoomRef.current = zoom;

        /*
         * User gestures mark the view as interacted; the one-time auto-fit
         * of a fresh layout then never overrides the user's navigation.
         * Registered BEFORE the zoom behaviour: d3-zoom's own handlers call
         * stopImmediatePropagation, which would swallow same-type listeners
         * registered after it.
         */
        const markInteracted = (): void => {
            interactedRef.current = true;
        };

        svg.on("wheel.guard", markInteracted)
            .on("pointerdown.guard", markInteracted)
            .on("dblclick.guard", markInteracted);

        svg.call(zoom);

        /*
         * The previous viewport is restored so unrelated re-renders
         * (e.g. filter changes on the same layout) never reset the view.
         */
        svg.call(zoom.transform, transformRef.current);

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
            .attr("fill", "#52525b");

        const nodes: SimNode[] = graph.nodes.map((node) => ({ ...node }));

        const links: SimLink[] = graph.relationships.map(
            (relationship) => ({
                source: relationship.source,
                target: relationship.target,
                type: relationship.type
            })
        );

        /*
         * Re-seed coordinates of the same layout so dragged nodes stay put
         * and the layout does not scatter on unrelated re-renders.
         */
        const seeded = isNewLayout ? 0 : seedPositions(nodes, positionsRef.current);

        const link = container
            .append("g")
            .attr("stroke", "#262626")
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
            .attr("stroke", "#000000")
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
            .attr("fill", "#ffffff")
            .attr("stroke", "#000000")
            .attr("stroke-width", 3)
            .attr("paint-order", "stroke");

        /*
         * A preserved layout is only reheated gently so nodes stay close to
         * where the user arranged them; a fresh layout runs at full strength.
         */
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
            .force("collide", d3.forceCollide().radius(24))
            .alpha(seeded > 0 ? 0.3 : 1);

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

            if (pendingRevealRef.current) {
                applyReveal();
            }
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
         * A fresh layout is fitted into view exactly once, after the force
         * simulation settles — but never over a user's navigation. This
         * replaces the old unconditional `end` handler that reset the
         * viewport (and re-fired after every drag reheat) ~3s in.
         */
        if (isNewLayout) {
            simulation.on("end", () => {
                if (!interactedRef.current) {
                    fitToView(true);
                }
            });
        }

        nodeSelection.current = node;
        linkSelection.current = link;
        simNodesRef.current = nodes;

        applyReveal();

        return () => {
            recordPositions(nodes, positionsRef.current);
            simulation.stop();
        };

    }, [graph, layoutKey, onSelect]);

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
                .attr("stroke", "#000000")
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
                datum.id === selectedId ? "#ffffff" : "#000000"
            )
            .attr("stroke-width", (datum) =>
                datum.id === selectedId ? 2.5 : 1.5
            )
            .style("filter", (datum) =>
                datum.id === selectedId
                    ? "drop-shadow(0 0 6px rgba(255,255,255,0.9))"
                    : null
            );

    }, [selectedId, graph]);

    return <svg ref={svgRef} className="h-full w-full" />;
});

export default GraphView;
