"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as d3 from "d3";
import type { NoteGraphData } from "@/types";

type NoteGraphViewProps = {
  data: NoteGraphData;
  className?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Node = d3.SimulationNodeDatum & { [key: string]: any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type D3Edge = d3.SimulationLinkDatum<D3Node> & { strength: number; linkType: string };

export function NoteGraphView({ data, className = "" }: NoteGraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || data.nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dimensions;

    // Create a group for the graph
    const g = svg.append("g");

    // Add zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Map nodes to D3-compatible format with mutable position properties
    const nodes: D3Node[] = data.nodes.map((n) => ({
      ...n,
      x: 0,
      y: 0,
    }));

    // Map edges to D3-compatible format
    const edges: D3Edge[] = data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      strength: e.strength,
      linkType: e.linkType,
    }));

    // Create simulation
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3
          .forceLink<D3Node, D3Edge>(edges)
          .id((d) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    // Create edges
    const edge = g
      .append("g")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-width", (d) => Math.max(1, (d.strength || 0) * 3));

    // Create nodes
    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer");

    // Apply drag behavior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node as any).call(
      d3
        .drag<SVGGElement, D3Node>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    // Add circles to nodes
    node
      .append("circle")
      .attr("r", (d) => Math.max(8, Math.min(20, (d.connectionCount || 0) * 2 + 8)))
      .attr("fill", (d) => d.courseColor || "#6B7FA3")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // Add labels to nodes
    node
      .append("text")
      .attr("dy", "0.35em")
      .attr("text-anchor", "middle")
      .attr("fill", "#fff")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text((d) => (d.label || "").slice(0, 3));

    // Add tooltips
    node.append("title").text((d) => d.label || "");

    // Click handler to navigate to note
    node.on("click", (event, d) => {
      event.preventDefault();
      router.push(`/notes/${d.id}`);
    });

    // Update positions on tick
    simulation.on("tick", () => {
      edge
        .attr("x1", (d) => (d.source as D3Node).x || 0)
        .attr("y1", (d) => (d.source as D3Node).y || 0)
        .attr("x2", (d) => (d.target as D3Node).x || 0)
        .attr("y2", (d) => (d.target as D3Node).y || 0);

      node.attr("transform", (d) => `translate(${d.x || 0},${d.y || 0})`);
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, dimensions, router]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="border border-border rounded-md bg-card"
      />
      {data.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No notes to display. Add more notes to see the graph.
          </p>
        </div>
      )}
      <div className="absolute bottom-2 right-2 text-[0.6rem] text-muted-foreground">
        {data.nodes.length} notes, {data.edges.length} connections
      </div>
    </div>
  );
}
