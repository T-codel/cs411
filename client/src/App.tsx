import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  AlertCircle,
  FolderTree,
  GitBranch,
  Loader2,
  Map as MapIcon,
  Sparkles,
  X,
} from "lucide-react";
import { analyzeRepository, explainRepository, guideRepository } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { GuideStep, NodeCategory, RepoEdge, RepoFolder, RepoTreeResponse } from "@/types";

const CATEGORY_COLORS: Record<NodeCategory, string> = {
  "Overview": "hsl(215 20% 45%)",
  "Entry Point": "hsl(0 72% 51%)",
  "UI / Presentation": "hsl(271 70% 52%)",
  "API / Interface": "hsl(217 91% 55%)",
  "Domain / Core Logic": "hsl(25 90% 50%)",
  "Data / Persistence": "hsl(142 70% 38%)",
  "Infrastructure / Configuration": "hsl(189 85% 38%)",
  "Shared / Utilities": "hsl(45 90% 42%)",
  "Testing / Quality": "hsl(330 75% 52%)",
  "Documentation / Examples": "hsl(168 72% 35%)",
};
const NODE_CATEGORIES = Object.keys(CATEGORY_COLORS) as NodeCategory[];

const sampleTree: RepoTreeResponse = {
  repo: "example/learning-platform",
  source_url: "https://github.com/example/learning-platform",
  explanation: "A sample repository map. Generate a tree to receive an AI-pruned architecture overview.",
  original_folder_count: 8,
  pruning_criteria: [],
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
    { id: "root", name: "learning-platform", path: "", depth: 0, child_count: 4, description: "Repository root.", category: "Overview", category_reason: "Top-level context." },
    { id: "src", name: "src", path: "src", depth: 1, parent: "root", child_count: 3, description: "Frontend source code.", category: "UI / Presentation", category_reason: "Contains the frontend." },
    { id: "server", name: "server", path: "server", depth: 1, parent: "root", child_count: 2, description: "Backend application.", category: "Domain / Core Logic", category_reason: "Contains backend behavior." },
    { id: "docs", name: "docs", path: "docs", depth: 1, parent: "root", child_count: 1, description: "Project documentation.", category: "Documentation / Examples", category_reason: "Contains documentation." },
    { id: "components", name: "components", path: "src/components", depth: 2, parent: "src", child_count: 2, description: "Reusable UI components.", category: "UI / Presentation", category_reason: "Reusable views." },
    { id: "routes", name: "routes", path: "src/routes", depth: 2, parent: "src", child_count: 0, description: "Application routes.", category: "Entry Point", category_reason: "Navigation entry points." },
    { id: "api", name: "api", path: "server/api", depth: 2, parent: "server", child_count: 0, description: "HTTP API layer.", category: "API / Interface", category_reason: "External HTTP boundary." },
    { id: "models", name: "models", path: "server/models", depth: 2, parent: "server", child_count: 0, description: "Domain and persistence models.", category: "Data / Persistence", category_reason: "Defines persisted data." },
  ],
};

const statusCopy = {
  idle: "Paste a GitHub repo URL to generate a folder map.",
  loading: "Reading repository folders...",
  ready: "Repository tree loaded.",
  error: "Could not load that repository.",
} as const;

// Returns a colour stop pair [borderColor, bgColor] for a guide step badge (1-indexed)
function guideStepColors(order: number): [string, string] {
  const palette: [string, string][] = [
    ["hsl(38 92% 50%)", "hsl(38 92% 50% / 0.14)"],   // 1 → amber
    ["hsl(221 83% 53%)", "hsl(221 83% 53% / 0.14)"],  // 2 → blue (primary)
    ["hsl(142 71% 45%)", "hsl(142 71% 45% / 0.14)"],  // 3 → green
    ["hsl(271 76% 60%)", "hsl(271 76% 60% / 0.14)"],  // 4 → violet
    ["hsl(340 82% 52%)", "hsl(340 82% 52% / 0.14)"],  // 5 → rose
  ];
  return palette[(order - 1) % palette.length];
}

function folderToNode(
  folder: RepoFolder,
  siblingIndex: number,
  guideMap: Map<string, GuideStep>,
): Node {
  const step = guideMap.get(folder.id);
  const [borderColor] = step ? guideStepColors(step.order) : [""];
  const categoryColor = CATEGORY_COLORS[folder.category];

  return {
    id: folder.id,
    position: {
      x: folder.depth * 310,
      y: siblingIndex * 120,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    style: {
      border: `2px solid ${categoryColor}`,
      background: `color-mix(in srgb, ${categoryColor} 10%, hsl(var(--card)))`,
      boxShadow: step
        ? `0 0 0 4px ${borderColor}, 0 18px 50px hsl(222 47% 11% / 0.18)`
        : `0 10px 30px hsl(222 47% 11% / 0.12)`,
    },
    data: {
      label: (
        <div className="repo-node">
          <div
            className="repo-node__icon"
            style={{ background: `color-mix(in srgb, ${categoryColor} 16%, transparent)`, color: categoryColor }}
          >
            {step ? (
              <span className="guide-order-badge" style={{ color: borderColor }}>
                {step.order}
              </span>
            ) : (
              <FolderTree size={18} />
            )}
          </div>
          <div>
            <strong>{folder.name}</strong>
            <span>{folder.path || "repo root"}</span>
          </div>
          <Badge style={{ color: categoryColor }} variant="secondary">{folder.category}</Badge>
        </div>
      ),
    },
  };
}

function buildNodes(folders: RepoFolder[], guideMap: Map<string, GuideStep>): Node[] {
  const depthCounts = new Map<number, number>();
  return folders.map((folder) => {
    const siblingIndex = depthCounts.get(folder.depth) ?? 0;
    depthCounts.set(folder.depth, siblingIndex + 1);
    return folderToNode(folder, siblingIndex, guideMap);
  });
}

function buildEdges(folders: RepoFolder[], repoEdges: RepoEdge[]): Edge[] {
  const visibleIds = new Set(folders.map((folder) => folder.id));
  return repoEdges
    .filter((edge) => visibleIds.has(edge.parent_id) && visibleIds.has(edge.child_id))
    .map((edge) => ({
      id: `${edge.parent_id}-${edge.child_id}`,
      source: edge.parent_id,
      target: edge.child_id,
      type: "smoothstep",
      label: edge.label,
      labelStyle: { fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 },
      labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: "hsl(var(--primary))",
      },
      style: {
        stroke: "hsl(var(--primary))",
        strokeWidth: 2,
      },
    }));
}

type NodeMenu = {
  folderId: string;
  folderPath: string;
  description: string;
  category: NodeCategory;
  categoryReason: string;
  x: number; // px from left of the <section>
  y: number; // px from top of the <section>
};

function AppInner() {
  const { fitView } = useReactFlow();
  const flowRef = useRef<HTMLDivElement>(null);
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [tree, setTree] = useState<RepoTreeResponse>(sampleTree);
  const [status, setStatus] = useState<keyof typeof statusCopy>("idle");
  const [error, setError] = useState("");
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState(false);

  // Guide state
  const [guideSteps, setGuideSteps] = useState<GuideStep[]>([]);
  const [guiding, setGuiding] = useState(false);
  const [guideError, setGuideError] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<NodeCategory>>(() => new Set(NODE_CATEGORIES));

  // Node context menu
  const [nodeMenu, setNodeMenu] = useState<NodeMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const guideMap = useMemo(() => {
    const map = new Map<string, GuideStep>();
    for (const step of guideSteps) map.set(step.folder_id, step);
    return map;
  }, [guideSteps]);

  const onNodeClick = useCallback<NodeMouseHandler>((event, node) => {
    const section = flowRef.current;
    if (!section) return;
    const rect = section.getBoundingClientRect();
    const folder = tree.folders.find((f) => f.id === node.id);
    setNodeMenu({
      folderId: node.id,
      folderPath: folder?.path || "(root)",
      description: folder?.description || "No description is available.",
      category: folder?.category || "Overview",
      categoryReason: folder?.category_reason || "",
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, [tree.folders]);

  // Close the menu when clicking outside it
  useEffect(() => {
    if (!nodeMenu) return;
    function handleOutsideClick(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Element)) {
        setNodeMenu(null);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [nodeMenu]);

  const visibleFolders = useMemo(
    () => tree.folders.filter((folder) => folder.id === "root" || activeCategories.has(folder.category)),
    [tree.folders, activeCategories],
  );
  const nodes = useMemo(() => buildNodes(visibleFolders, guideMap), [visibleFolders, guideMap]);
  const edges = useMemo(() => buildEdges(visibleFolders, tree.edges), [visibleFolders, tree.edges]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    setGuideSteps([]);
    setGuideError("");

    try {
      const result = await analyzeRepository(repoUrl);
      setTree(result);
      setExplanation(result.explanation);
      setActiveCategories(new Set(NODE_CATEGORIES));
      setStatus("ready");
      setTimeout(() => fitView({ padding: 0.22, duration: 400 }), 50);
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
  }

  async function handleExplain() {
    setExplaining(true);
    try {
      const result = await explainRepository(tree.repo, tree.folders);
      setExplanation(result.explanation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate explanation.");
    } finally {
      setExplaining(false);
    }
  }

  const handleGuide = useCallback(async () => {
    setGuiding(true);
    setGuideError("");
    setGuideSteps([]);
    try {
      const result = await guideRepository(tree.repo, tree.folders);
      setGuideSteps(result.steps);
    } catch (caught) {
      setGuideError(caught instanceof Error ? caught.message : "Could not generate guide.");
    } finally {
      setGuiding(false);
    }
  }, [tree]);

  function toggleCategory(category: NodeCategory) {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_32rem),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)))] text-foreground">
      <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="border-b border-border/70 bg-card/88 p-5 shadow-sm backdrop-blur-xl lg:border-b-0 lg:border-r">
          <Card className="border-border/80 bg-card/90 shadow-none">
            <CardHeader>
              <Badge className="w-fit gap-1.5" variant="outline">
                <Sparkles size={14} />
                React Flow repo mapper
              </Badge>
              <CardTitle className="text-3xl">Folder Tree</CardTitle>
              <CardDescription>
                Enter a public GitHub repository URL. The app draws folders left to right and ignores loose files.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleSubmit}>
                <Input
                  aria-label="Repository URL"
                  onChange={(event) => setRepoUrl(event.target.value)}
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                />
                <Button className="w-full gap-2" disabled={status === "loading"} type="submit">
                  {status === "loading" ? <Loader2 className="animate-spin" size={16} /> : <GitBranch size={16} />}
                  Generate tree
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4">
            <Card className="border-border/80 bg-card/76 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Current Map</CardTitle>
                <CardDescription>{statusCopy[status]}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Repository</span>
                  <span className="font-medium">{tree.repo}</span>
                </div>
                <div className="rounded-md border bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">AI-pruned folders</span>
                    <span className="font-medium">{tree.folders.length} / {tree.original_folder_count}</span>
                  </div>
                  {explanation ? <p className="mt-2 text-xs leading-relaxed text-foreground/80">{explanation}</p> : null}
                </div>
                <Button
                  className="w-full gap-2"
                  disabled={explaining || tree.folders.length === 0}
                  onClick={handleExplain}
                  variant="outline"
                >
                  {explaining ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  Regenerate description
                </Button>
                <div className="flex items-center justify-between rounded-md border bg-background px-3 py-2">
                  <span className="text-muted-foreground">Folders shown</span>
                  <span className="font-medium">{tree.folders.length}</span>
                </div>
                {error ? (
                  <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive">
                    <AlertCircle className="mt-0.5 shrink-0" size={16} />
                    <p>{error}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            {/* ── FR-05: Start Guide card ── */}
            <Card className="border-border/80 bg-card/76 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Node categories</CardTitle>
                <CardDescription>Filter the LLM-labelled architecture map.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="flex gap-2">
                  <Button className="h-8 flex-1 text-xs" onClick={() => setActiveCategories(new Set(NODE_CATEGORIES))} variant="outline">Show all</Button>
                  <Button className="h-8 flex-1 text-xs" onClick={() => setActiveCategories(new Set())} variant="outline">Clear</Button>
                </div>
                <div className="category-legend">
                  {NODE_CATEGORIES.map((category) => {
                    const active = activeCategories.has(category);
                    return (
                      <button aria-pressed={active} className="category-legend__item" key={category} onClick={() => toggleCategory(category)} style={{ opacity: active ? 1 : 0.42 }} type="button">
                        <span className="category-legend__swatch" style={{ background: CATEGORY_COLORS[category] }} />
                        <span>{category}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Showing {visibleFolders.length} of {tree.folders.length} nodes. The root stays visible for context.</p>
              </CardContent>
            </Card>

            <Card className="border-border/80 bg-card/76 shadow-none">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapIcon size={16} />
                  Exploration Guide
                </CardTitle>
                <CardDescription>
                  Let AI recommend the best starting points in this repository.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Button
                  className="w-full gap-2"
                  disabled={guiding || tree.folders.length === 0}
                  onClick={handleGuide}
                  variant={guideSteps.length > 0 ? "outline" : "default"}
                >
                  {guiding ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <MapIcon size={16} />
                  )}
                  {guideSteps.length > 0 ? "Regenerate guide" : "Start guide"}
                </Button>

                {guideError ? (
                  <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 shrink-0" size={16} />
                    <p>{guideError}</p>
                  </div>
                ) : null}

                {guideSteps.length > 0 && (
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Recommended path
                      </p>
                      <button
                        aria-label="Clear guide"
                        className="flex items-center justify-center p-1 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setGuideSteps([])}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {guideSteps.map((step) => {
                      const [borderColor, bgColor] = guideStepColors(step.order);
                      return (
                        <div
                          key={step.folder_id}
                          className="flex gap-3 rounded-md border p-3 text-sm"
                          style={{ borderColor, background: bgColor }}
                        >
                          <span
                            className="guide-step-number shrink-0"
                            style={{ color: borderColor }}
                          >
                            {step.order}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold truncate" style={{ color: borderColor }}>
                              {step.folder_path || "(root)"}
                            </p>
                            <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">
                              {step.reason}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </aside>

        <section className="min-h-[62vh] lg:min-h-svh relative" ref={flowRef}>
          {nodeMenu && (
            <div
              ref={menuRef}
              className="node-menu"
              style={{ left: nodeMenu.x, top: nodeMenu.y }}
            >
              <p className="node-menu__path">{nodeMenu.folderPath || "(root)"}</p>
              <div className="node-menu__category" style={{ color: CATEGORY_COLORS[nodeMenu.category] }}>
                <span className="category-legend__swatch" style={{ background: CATEGORY_COLORS[nodeMenu.category] }} />
                {nodeMenu.category}
              </div>
              <p className="node-menu__description">{nodeMenu.description}</p>
              {nodeMenu.categoryReason ? <p className="node-menu__reason">{nodeMenu.categoryReason}</p> : null}
            </div>
          )}
          <ReactFlow
            className="repo-flow"
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.18}
            nodes={nodes}
            nodesDraggable
            onNodeClick={onNodeClick}
            onPaneClick={() => setNodeMenu(null)}
          >
            <MiniMap maskColor="hsl(var(--background) / 0.72)" pannable zoomable />
            <Controls />
            <Background color="hsl(var(--muted-foreground) / 0.38)" gap={28} size={1} />
          </ReactFlow>
        </section>
      </div>
    </main>
  );
}

function App() {
  return (
    <ReactFlowProvider>
      <AppInner />
    </ReactFlowProvider>
  );
}

export default App;
