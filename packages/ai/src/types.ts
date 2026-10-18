/**
 * Types for `@firo/ai`.
 *
 * Local-first AI engine for Firo whiteboard and record store.
 * Strictly adheres to NFR-3 (zero telemetry or cloud network calls).
 */
import type { Mutation } from "@firo/doc";
import type {
  Collection,
  FiroElement,
  FiroRecord,
  FrameElement,
} from "@firo/schema";

/* -------------------------------------------------------------------------- */
/* Client & Provider Types                                                    */
/* -------------------------------------------------------------------------- */

export type LlmProviderType = "ollama" | "openai-compatible";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = Readonly<{
  role: ChatRole;
  content: string;
}>;

export type LlmClientConfig = Readonly<{
  /**
   * The provider protocol to use.
   * - "ollama": Native Ollama HTTP API (defaults to http://localhost:11434).
   * - "openai-compatible": Generic OpenAI-compatible API (LM Studio, vLLM, LocalAI).
   * Defaults to "ollama".
   */
  provider?: LlmProviderType;

  /**
   * The base URL for the local model endpoint.
   * Defaults:
   * - Ollama: "http://localhost:11434"
   * - OpenAI-compatible: "http://localhost:1234/v1"
   */
  baseUrl?: string;

  /**
   * The model name to query.
   * Defaults to "llama3" (or whatever model is configured locally).
   */
  model?: string;

  /**
   * Sampling temperature. Defaults to 0.2 for deterministic/structured tasks.
   */
  temperature?: number;

  /**
   * Request timeout in milliseconds. Defaults to 60000 (60s).
   */
  timeoutMs?: number;

  /**
   * Default system prompt passed to requests.
   */
  systemPrompt?: string;

  /**
   * Custom fetch implementation, primarily for testing or sandboxing.
   */
  fetchFn?: typeof fetch;

  /**
   * Optional API key or bearer token for local servers requiring authorization.
   */
  apiKey?: string;
}>;

export type LlmGenerateOptions = Readonly<{
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  timeoutMs?: number;
  formatJson?: boolean;
}>;

export type LlmErrorCode =
  | "UNREACHABLE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE"
  | "PARSE_ERROR";

export class LlmClientError extends Error {
  readonly code: LlmErrorCode;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(
    message: string,
    code: LlmErrorCode,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message);
    this.name = "LlmClientError";
    this.code = code;
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

export interface LlmClient {
  readonly config: Readonly<LlmClientConfig>;
  getEndpointUrl(): string;
  chat(
    messages: readonly ChatMessage[],
    options?: LlmGenerateOptions,
  ): Promise<string>;
  complete(prompt: string, options?: LlmGenerateOptions): Promise<string>;
  completeJson<T>(prompt: string, options?: LlmGenerateOptions): Promise<T>;
  ping(): Promise<boolean>;
}

/* -------------------------------------------------------------------------- */
/* Operations: Sticky Note Clustering                                         */
/* -------------------------------------------------------------------------- */

export type SentimentType = "positive" | "neutral" | "negative" | "mixed";

export type StickyCluster = Readonly<{
  id: string;
  title: string;
  topic: string;
  sentiment: SentimentType;
  keywords: readonly string[];
  noteIds: readonly string[];
  bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}>;

export type ClusterOptions = Readonly<{
  /** Whether to wrap each cluster inside a canvas FrameElement. Defaults to true. */
  createFrames?: boolean;
  /** Canvas origin X coordinate for layout. Defaults to 0. */
  originX?: number;
  /** Canvas origin Y coordinate for layout. Defaults to 0. */
  originY?: number;
  /** Notes per row inside each cluster frame. Defaults to 3. */
  columnsPerCluster?: number;
  /** Gap in pixels between clusters. Defaults to 100. */
  clusterGap?: number;
}>;

export type ClusterResult = Readonly<{
  clusters: readonly StickyCluster[];
  frames: readonly FrameElement[];
  mutations: readonly Mutation[];
}>;

/* -------------------------------------------------------------------------- */
/* Operations: Summarization                                                  */
/* -------------------------------------------------------------------------- */

export type BoardSummaryResult = Readonly<{
  title: string;
  overview: string;
  themes: readonly Readonly<{
    name: string;
    description: string;
  }>[];
  unresolvedQuestions: readonly string[];
  keyDecisions: readonly string[];
  markdown: string;
}>;

export type ActionItem = Readonly<{
  task: string;
  assignee: string | null;
  status: "open" | "done" | "in-progress";
  threadId: string;
}>;

export type CommentSummaryResult = Readonly<{
  summary: string;
  actionItems: readonly ActionItem[];
  keyDebates: readonly string[];
  markdown: string;
}>;

/* -------------------------------------------------------------------------- */
/* Operations: Text-to-Diagram                                                */
/* -------------------------------------------------------------------------- */

export type DiagramShapeType = "rectangle" | "diamond" | "ellipse";

export type DiagramNode = Readonly<{
  id: string;
  label: string;
  shape: DiagramShapeType;
  role?: "start" | "end" | "step" | "decision";
}>;

export type DiagramEdge = Readonly<{
  from: string;
  to: string;
  label?: string;
}>;

export type DiagramResult = Readonly<{
  title: string;
  nodes: readonly DiagramNode[];
  edges: readonly DiagramEdge[];
  elements: readonly FiroElement[];
  mutations: readonly Mutation[];
}>;

export type TextToDiagramOptions = Readonly<{
  originX?: number;
  originY?: number;
  direction?: "top-to-bottom" | "left-to-right";
  nodeWidth?: number;
  nodeHeight?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
}>;

/* -------------------------------------------------------------------------- */
/* Operations: Text-to-Records                                                */
/* -------------------------------------------------------------------------- */

export type TextToRecordsOptions = Readonly<{
  collection: Collection;
  text: string;
}>;

export type TextToRecordsResult = Readonly<{
  collectionId: string;
  records: readonly FiroRecord[];
  mutations: readonly Mutation[];
}>;
