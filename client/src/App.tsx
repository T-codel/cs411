import { FormEvent, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";
import { AlertCircle, FolderTree, GitBranch, Loader2, Sparkles } from "lucide-react";
import { analyzeRepository } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RepoFolder, RepoTreeResponse } from "@/types";

const sampleTree: RepoTreeResponse = {
  repo: "example/learning-platform",
  source_url: "https://github.com/example/learning-platform",
  folders: [
    { id: "root", name: "learning-platform", path: "", depth: 0, child_count: 4 },
    { id: "src", name: "src", path: "src", depth: 1, parent: "root", child_count: 3 },
    { id: "server", name: "server", path: "server", depth: 1, parent: "root", child_count: 2 },
    { id: "docs", name: "docs", path: "docs", depth: 1, parent: "root", child_count: 1 },
    { id: "components", name: "components", path: "src/components", depth: 2, parent: "src", child_count: 2 },
    { id: "routes", name: "routes", path: "src/routes", depth: 2, parent: "src", child_count: 0 },
    { id: "api", name: "api", path: "server/api", depth: 2, parent: "server", child_count: 0 },
    { id: "models", name: "models", path: "server/models", depth: 2, parent: "server", child_count: 0 },
  ],
};

const statusCopy = {
  idle: "Paste a GitHub repo URL to generate a folder map.",
  loading: "Reading repository folders...",
  ready: "Repository tree loaded.",
  error: "Could not load that repository.",
} as const;

function folderToNode(folder: RepoFolder, siblingIndex: number): Node {
  return {
    id: folder.id,
    position: {
      x: folder.depth * 310,
      y: siblingIndex * 120,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: (
        <div className="repo-node">
          <div className="repo-node__icon">
            <FolderTree size={18} />
          </div>
          <div>
            <strong>{folder.name}</strong>
            <span>{folder.path || "repo root"}</span>
          </div>
          <Badge variant="secondary">{folder.child_count}</Badge>
        </div>
      ),
    },
  };
}

function buildNodes(folders: RepoFolder[]): Node[] {
  const depthCounts = new Map<number, number>();

  return folders.map((folder) => {
    const siblingIndex = depthCounts.get(folder.depth) ?? 0;
    depthCounts.set(folder.depth, siblingIndex + 1);
    return folderToNode(folder, siblingIndex);
  });
}

function buildEdges(folders: RepoFolder[]): Edge[] {
  return folders
    .filter((folder) => folder.parent)
    .map((folder) => ({
      id: `${folder.parent}-${folder.id}`,
      source: folder.parent!,
      target: folder.id,
      type: "smoothstep",
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

function App() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/facebook/react");
  const [tree, setTree] = useState<RepoTreeResponse>(sampleTree);
  const [status, setStatus] = useState<keyof typeof statusCopy>("idle");
  const [error, setError] = useState("");

  const nodes = useMemo(() => buildNodes(tree.folders), [tree.folders]);
  const edges = useMemo(() => buildEdges(tree.folders), [tree.folders]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const result = await analyzeRepository(repoUrl);
      setTree(result);
      setStatus("ready");
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
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
          </div>
        </aside>

        <section className="min-h-[62vh] lg:min-h-svh">
          <ReactFlow
            className="repo-flow"
            edges={edges}
            fitView
            fitViewOptions={{ padding: 0.22 }}
            minZoom={0.18}
            nodes={nodes}
            nodesDraggable
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

export default App;
