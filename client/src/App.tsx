import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background, Controls, MarkerType, MiniMap, Position, ReactFlowProvider, useReactFlow,
  type Edge, type Node, type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  AlertCircle, Check, ChevronLeft, ChevronRight, FolderTree, GitBranch,
  Loader2, Map as MapIcon, Sparkles, X,
} from "lucide-react";
import { analyzeRepository, explainRepository, guideRepository } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { GuideStep, NodeCategory, RepoEdge, RepoFolder, RepoTreeResponse } from "@/types";

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  "Overview": "hsl(215 20% 45%)", "Entry Point": "hsl(0 72% 51%)",
  "UI / Presentation": "hsl(271 70% 52%)", "API / Interface": "hsl(217 91% 55%)",
  "Domain / Core Logic": "hsl(25 90% 50%)", "Data / Persistence": "hsl(142 70% 38%)",
  "Infrastructure / Configuration": "hsl(189 85% 38%)", "Shared / Utilities": "hsl(45 90% 42%)",
  "Testing / Quality": "hsl(330 75% 52%)", "Documentation / Examples": "hsl(168 72% 35%)",
};
const CATEGORY_SHORT: Record<NodeCategory, string> = {
  "Overview": "Overview", "Entry Point": "Entry", "UI / Presentation": "UI",
  "API / Interface": "API", "Domain / Core Logic": "Core", "Data / Persistence": "Data",
  "Infrastructure / Configuration": "Infra", "Shared / Utilities": "Shared",
  "Testing / Quality": "Tests", "Documentation / Examples": "Docs",
};
const NODE_CATEGORIES = Object.keys(CATEGORY_COLORS) as NodeCategory[];
const FILTER_PRESETS: Record<string, NodeCategory[]> = {
  "Application": ["Entry Point", "UI / Presentation", "API / Interface", "Domain / Core Logic", "Shared / Utilities"],
  "Data": ["API / Interface", "Domain / Core Logic", "Data / Persistence"],
  "Infrastructure": ["Infrastructure / Configuration", "Entry Point"],
  "Tests & docs": ["Testing / Quality", "Documentation / Examples"],
};
type ViewMode = "architecture" | "guide";

const sampleTree: RepoTreeResponse = {
  repo: "example/learning-platform", source_url: "https://github.com/example/learning-platform",
  explanation: "A sample repository map. Generate a tree to receive an AI-pruned architecture overview.",
  original_folder_count: 8, pruning_criteria: [],
  edges: [
    { parent_id: "root", child_id: "src", label: "contains" },
    { parent_id: "root", child_id: "server", label: "contains" },
    { parent_id: "root", child_id: "docs", label: "documents" },
    { parent_id: "src", child_id: "components", label: "renders" },
    { parent_id: "src", child_id: "routes", label: "routes to" },
    { parent_id: "server", child_id: "api", label: "exposes" },
    { parent_id: "server", child_id: "models", label: "persists through" },
  ],
  folders: [
    { id: "root", name: "learning-platform", path: "", depth: 0, child_count: 3, description: "Repository root.", category: "Overview", category_reason: "Top-level context." },
    { id: "src", name: "src", path: "src", depth: 1, parent: "root", child_count: 2, description: "Frontend source code.", category: "UI / Presentation", category_reason: "Contains the frontend." },
    { id: "server", name: "server", path: "server", depth: 1, parent: "root", child_count: 2, description: "Backend application.", category: "Domain / Core Logic", category_reason: "Contains backend behavior." },
    { id: "docs", name: "docs", path: "docs", depth: 1, parent: "root", child_count: 0, description: "Project documentation.", category: "Documentation / Examples", category_reason: "Contains documentation." },
    { id: "components", name: "components", path: "src/components", depth: 2, parent: "src", child_count: 0, description: "Reusable UI components.", category: "UI / Presentation", category_reason: "Reusable views." },
    { id: "routes", name: "routes", path: "src/routes", depth: 2, parent: "src", child_count: 0, description: "Application routes.", category: "Entry Point", category_reason: "Navigation entry points." },
    { id: "api", name: "api", path: "server/api", depth: 2, parent: "server", child_count: 0, description: "HTTP API layer.", category: "API / Interface", category_reason: "External HTTP boundary." },
    { id: "models", name: "models", path: "server/models", depth: 2, parent: "server", child_count: 0, description: "Domain and persistence models.", category: "Data / Persistence", category_reason: "Defines persisted data." },
  ],
};

function visibleWithContext(folders: RepoFolder[], active: Set<NodeCategory>): RepoFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const visible = new Set<string>(["root"]);
  for (const folder of folders) {
    if (!active.has(folder.category)) continue;
    let current: RepoFolder | undefined = folder;
    while (current) {
      visible.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
  }
  return folders.filter((folder) => visible.has(folder.id));
}

function buildNodes(
  folders: RepoFolder[], mode: ViewMode, guide: GuideStep[], guideIndex: number,
  active: Set<NodeCategory>,
): Node[] {
  const depthCounts = new Map<number, number>();
  return folders.map((folder) => {
    const row = depthCounts.get(folder.depth) ?? 0;
    depthCounts.set(folder.depth, row + 1);
    const stepIndex = guide.findIndex((step) => step.folder_id === folder.id);
    const isCurrent = mode === "guide" && stepIndex === guideIndex;
    const isComplete = mode === "guide" && stepIndex >= 0 && stepIndex < guideIndex;
    const isGuideNode = stepIndex >= 0;
    const isContext = !active.has(folder.category);
    const categoryColor = CATEGORY_COLORS[folder.category];
    return {
      id: folder.id, position: { x: folder.depth * 320, y: row * 116 },
      sourcePosition: Position.Right, targetPosition: Position.Left,
      style: {
        border: isCurrent ? "2px solid hsl(38 92% 50%)" : "1px solid hsl(var(--border))",
        background: "hsl(var(--card))",
        boxShadow: isCurrent ? "0 0 0 4px hsl(38 92% 50% / .2), 0 18px 42px hsl(222 47% 11% / .18)" : "0 8px 24px hsl(222 47% 11% / .09)",
        opacity: mode === "guide" && !isGuideNode ? 0.3 : isContext ? 0.5 : 1,
      },
      data: { label: (
        <div className="repo-node">
          <span className="repo-node__category-strip" style={{ background: mode === "guide" ? "hsl(var(--border))" : categoryColor }} />
          <div className="repo-node__icon">
            {mode === "guide" && isGuideNode
              ? <span className={`guide-order-badge${isCurrent ? " is-current" : ""}`}>{isComplete ? <Check size={13} /> : stepIndex + 1}</span>
              : <FolderTree size={18} />}
          </div>
          <div className="repo-node__copy"><strong>{folder.name}</strong><span>{folder.path || "repo root"}</span></div>
          <span className="repo-node__kind">{isContext ? "context" : CATEGORY_SHORT[folder.category]}</span>
        </div>
      ) },
    };
  });
}

function buildEdges(
  folders: RepoFolder[], repoEdges: RepoEdge[], mode: ViewMode,
  selectedId: string | null, currentGuideId: string | null,
): Edge[] {
  const visible = new Set(folders.map((folder) => folder.id));
  return repoEdges.filter((edge) => visible.has(edge.parent_id) && visible.has(edge.child_id)).map((edge) => {
    const focusedId = mode === "guide" ? currentGuideId : selectedId;
    const focused = edge.parent_id === focusedId || edge.child_id === focusedId;
    return {
      id: `${edge.parent_id}-${edge.child_id}`, source: edge.parent_id, target: edge.child_id,
      type: "smoothstep", label: focused && edge.label !== "contains" ? edge.label : undefined,
      labelStyle: { fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.94 },
      labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, color: focused ? "hsl(38 92% 50%)" : "hsl(var(--muted-foreground))" },
      style: { stroke: focused ? "hsl(38 92% 50%)" : "hsl(var(--muted-foreground) / .45)", strokeWidth: focused ? 2.5 : 1.4 },
    };
  });
}

function NodeDetails({ folder, onClose }: { folder: RepoFolder; onClose: () => void }) {
  const color = CATEGORY_COLORS[folder.category];
  return (
    <aside className="node-details" aria-label="Folder details">
      <div className="node-details__header">
        <div><p>{folder.path || "Repository root"}</p><h2>{folder.name}</h2></div>
        <button aria-label="Close details" onClick={onClose}><X size={17} /></button>
      </div>
      <div className="node-details__category" style={{ color }}><span style={{ background: color }} />{folder.category}</div>
      <p className="node-details__description">{folder.description}</p>
      <div className="node-details__section"><span>Why this category</span><p>{folder.category_reason || "No classification reason was provided."}</p></div>
      <div className="node-details__section"><span>Structure</span><p>{folder.child_count} retained child {folder.child_count === 1 ? "folder" : "folders"}</p></div>
    </aside>
  );
}

function AppInner() {
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [tree, setTree] = useState<RepoTreeResponse>(sampleTree);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState(sampleTree.explanation);
  const [explaining, setExplaining] = useState(false);
  const [guideSteps, setGuideSteps] = useState<GuideStep[]>([]);
  const [guideIndex, setGuideIndex] = useState(0);
  const [guiding, setGuiding] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [mode, setMode] = useState<ViewMode>("architecture");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<NodeCategory>>(() => new Set(NODE_CATEGORIES));

  const categoryCounts = useMemo(() => {
    const counts = new Map<NodeCategory, number>();
    for (const folder of tree.folders) counts.set(folder.category, (counts.get(folder.category) ?? 0) + 1);
    return counts;
  }, [tree.folders]);
  const activePresentCount = useMemo(
    () => NODE_CATEGORIES.filter((category) => categoryCounts.has(category) && activeCategories.has(category)).length,
    [categoryCounts, activeCategories],
  );
  const visibleFolders = useMemo(() => visibleWithContext(tree.folders, activeCategories), [tree.folders, activeCategories]);
  const currentGuide = guideSteps[guideIndex] ?? null;
  const nodes = useMemo(
    () => buildNodes(visibleFolders, mode, guideSteps, guideIndex, activeCategories),
    [visibleFolders, mode, guideSteps, guideIndex, activeCategories],
  );
  const edges = useMemo(
    () => buildEdges(visibleFolders, tree.edges, mode, selectedId, currentGuide?.folder_id ?? null),
    [visibleFolders, tree.edges, mode, selectedId, currentGuide?.folder_id],
  );
  const selectedFolder = tree.folders.find((folder) => folder.id === selectedId) ?? null;

  useEffect(() => {
    if (mode !== "guide" || !currentGuide) return;
    const timer = window.setTimeout(() => {
      const focusNodes = nodes.filter((node) => node.id === currentGuide.folder_id);
      if (focusNodes.length) void fitView({ nodes: focusNodes, padding: 1.5, duration: 450 });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [mode, guideIndex, currentGuide, nodes, fitView]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("loading"); setError(""); setGuideSteps([]); setGuideError(""); setMode("architecture"); setSelectedId(null);
    try {
      const result = await analyzeRepository(repoUrl);
      setTree(result); setExplanation(result.explanation); setActiveCategories(new Set(NODE_CATEGORIES)); setStatus("ready");
      window.setTimeout(() => void fitView({ padding: 0.22, duration: 400 }), 50);
    } catch (caught) { setStatus("error"); setError(caught instanceof Error ? caught.message : "Something went wrong."); }
  }

  async function handleExplain() {
    setExplaining(true);
    try { const result = await explainRepository(tree.repo, tree.folders); setExplanation(result.explanation); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not generate explanation."); }
    finally { setExplaining(false); }
  }

  const handleGuide = useCallback(async () => {
    setGuiding(true); setGuideError("");
    try {
      const result = await guideRepository(tree.repo, tree.folders);
      setGuideSteps(result.steps); setGuideIndex(0); setMode("guide"); setSelectedId(result.steps[0]?.folder_id ?? null);
    } catch (caught) { setGuideError(caught instanceof Error ? caught.message : "Could not generate guide."); }
    finally { setGuiding(false); }
  }, [tree]);

  const onNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedId(node.id);
    if (mode === "guide") {
      const index = guideSteps.findIndex((step) => step.folder_id === node.id);
      if (index >= 0) setGuideIndex(index);
    }
  }, [mode, guideSteps]);

  function toggleCategory(category: NodeCategory) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  function moveGuide(direction: -1 | 1) {
    const next = Math.max(0, Math.min(guideSteps.length - 1, guideIndex + direction));
    setGuideIndex(next); setSelectedId(guideSteps[next]?.folder_id ?? null);
  }

  return (
    <main className="app-shell">
      <div className="app-layout">
        <aside className="control-rail">
          <Card className="border-border/80 bg-card/95 shadow-none">
            <CardHeader><Badge className="w-fit gap-1.5" variant="outline"><Sparkles size={14} />Repo mapper</Badge><CardTitle className="text-3xl">Folder Tree</CardTitle><CardDescription>Generate a focused architecture map from a public GitHub repository.</CardDescription></CardHeader>
            <CardContent><form className="grid gap-3" onSubmit={handleSubmit}><Input aria-label="Repository URL" onChange={(event) => setRepoUrl(event.target.value)} placeholder="https://github.com/owner/repo" value={repoUrl} /><Button className="w-full gap-2" disabled={status === "loading"} type="submit">{status === "loading" ? <Loader2 className="animate-spin" size={16} /> : <GitBranch size={16} />}Generate tree</Button></form></CardContent>
          </Card>

          <section className="rail-section">
            <div className="rail-heading"><div><h2>{tree.repo}</h2><p>{visibleFolders.length} shown · {tree.folders.length} retained · {tree.original_folder_count} scanned</p></div><Button className="h-8 px-2" disabled={explaining} onClick={handleExplain} variant="ghost">{explaining ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}</Button></div>
            <p className="repo-summary">{explanation}</p>
            {error ? <div className="error-message"><AlertCircle size={16} /><p>{error}</p></div> : null}
          </section>

          <details className="filter-panel" open>
            <summary>Categories <span>{activePresentCount}/{categoryCounts.size}</span></summary>
            <div className="filter-actions"><button onClick={() => setActiveCategories(new Set(NODE_CATEGORIES))}>Show all</button><button onClick={() => setActiveCategories(new Set())}>Hide all</button></div>
            <div className="preset-list">{Object.entries(FILTER_PRESETS).map(([name, categories]) => <button key={name} onClick={() => setActiveCategories(new Set(categories))}>{name}</button>)}</div>
            <div className="category-list">{NODE_CATEGORIES.filter((category) => categoryCounts.has(category)).map((category) => (
              <label key={category}><input checked={activeCategories.has(category)} onChange={() => toggleCategory(category)} type="checkbox" /><span className="category-swatch" style={{ background: CATEGORY_COLORS[category] }} /><span>{category}</span><small>{categoryCounts.get(category)}</small></label>
            ))}</div>
            <p className="context-note">Muted ancestors stay visible to preserve structure.</p>
          </details>

          <section className="guide-panel">
            <div className="rail-heading"><div><h2>Exploration guide</h2><p>Follow one recommended folder at a time.</p></div>{mode === "guide" ? <button className="icon-button" aria-label="Exit guide" onClick={() => setMode("architecture")}><X size={16} /></button> : null}</div>
            {guideError ? <div className="error-message"><AlertCircle size={16} /><p>{guideError}</p></div> : null}
            {mode === "guide" && currentGuide ? (
              <div className="guide-current">
                <div className="guide-progress"><span>Step {guideIndex + 1} of {guideSteps.length}</span><div><i style={{ width: `${((guideIndex + 1) / guideSteps.length) * 100}%` }} /></div></div>
                <h3>{currentGuide.folder_path}</h3><p>{currentGuide.reason}</p>
                <div className="guide-nav"><Button disabled={guideIndex === 0} onClick={() => moveGuide(-1)} variant="outline"><ChevronLeft size={15} />Previous</Button><Button disabled={guideIndex === guideSteps.length - 1} onClick={() => moveGuide(1)}>Next<ChevronRight size={15} /></Button></div>
              </div>
            ) : <Button className="w-full gap-2" disabled={guiding || !tree.folders.length} onClick={handleGuide}>{guiding ? <Loader2 className="animate-spin" size={16} /> : <MapIcon size={16} />}{guideSteps.length ? "Restart guided tour" : "Start guided tour"}</Button>}
          </section>
        </aside>

        <section className="graph-stage" ref={flowRef}>
          <div className="mode-switch" aria-label="Graph view mode"><button aria-pressed={mode === "architecture"} onClick={() => setMode("architecture")}>Architecture</button><button aria-pressed={mode === "guide"} disabled={!guideSteps.length} onClick={() => setMode("guide")}>Guided tour</button></div>
          <ReactFlow className="repo-flow" edges={edges} fitView fitViewOptions={{ padding: 0.22 }} minZoom={0.18} nodes={nodes} nodesDraggable onNodeClick={onNodeClick} onPaneClick={() => setSelectedId(null)}>
            <MiniMap maskColor="hsl(var(--background) / 0.75)" pannable zoomable /><Controls /><Background color="hsl(var(--muted-foreground) / 0.24)" gap={28} size={1} />
          </ReactFlow>
          {selectedFolder ? <NodeDetails folder={selectedFolder} onClose={() => setSelectedId(null)} /> : null}
        </section>
      </div>
    </main>
  );
}

export default function App() { return <ReactFlowProvider><AppInner /></ReactFlowProvider>; }
