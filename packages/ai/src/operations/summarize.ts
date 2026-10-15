/**
 * Board and comment thread summarization operations.
 *
 * Extracts overview of ideas, themes, unresolved questions, and action items.
 */
import {
  isElementType,
  isProseMirrorDoc,
  proseMirrorToPlainText,
} from "@firo/schema";

import type { CommentThread, FiroElement } from "@firo/schema";

import type { BoardSnapshot } from "@firo/doc";

import type {
  ActionItem,
  BoardSummaryResult,
  CommentSummaryResult,
  LlmClient,
} from "../types.js";

type RawBoardSummary = {
  title?: string;
  overview?: string;
  themes?: Array<{ name?: string; description?: string }>;
  unresolvedQuestions?: string[];
  keyDecisions?: string[];
};

type RawCommentSummary = {
  summary?: string;
  actionItems?: Array<{
    task?: string;
    assignee?: string | null;
    status?: "open" | "done" | "in-progress";
    threadId?: string;
  }>;
  keyDebates?: string[];
};

/**
 * Summarizes the content of a board or a set of canvas elements.
 */
export async function summarizeBoard(
  boardOrElements: BoardSnapshot | readonly FiroElement[],
  client: LlmClient,
): Promise<BoardSummaryResult> {
  let elements: readonly FiroElement[];
  const recordsSummary: string[] = [];
  const commentsSummary: string[] = [];

  if (
    "elements" in boardOrElements &&
    Array.isArray(boardOrElements.elements)
  ) {
    const snapshot = boardOrElements as BoardSnapshot;
    elements = snapshot.elements;

    if (snapshot.collections && snapshot.records) {
      for (const col of snapshot.collections) {
        const recordsInCol = snapshot.records.filter(
          (r) => r.collectionId === col.id && !r.archived,
        );
        recordsSummary.push(
          `Collection "${col.name}" has ${recordsInCol.length} records.`,
        );
      }
    }

    if (snapshot.comments) {
      for (const t of snapshot.comments) {
        const commentsText = t.comments
          .map((c) => `${c.author}: ${c.body}`)
          .join(" | ");
        commentsSummary.push(
          `Thread (${t.resolved ? "resolved" : "open"}): ${commentsText}`,
        );
      }
    }
  } else {
    elements = boardOrElements as readonly FiroElement[];
  }

  // Extract texts from elements
  const textItems: string[] = [];
  for (const el of elements) {
    if (el.isDeleted) {
      continue;
    }
    if (isElementType(el, "stickynote")) {
      if (el.text?.trim()) {
        textItems.push(`[Sticky Note] ${el.text.trim()}`);
      }
    } else if (isElementType(el, "text")) {
      if (el.text?.trim()) {
        textItems.push(`[Text] ${el.text.trim()}`);
      }
    } else if (isElementType(el, "frame")) {
      if (el.name?.trim()) {
        textItems.push(`[Frame Section] ${el.name.trim()}`);
      }
    } else if ("text" in el && isProseMirrorDoc(el.text)) {
      const plain = proseMirrorToPlainText(el.text);
      if (plain.trim()) {
        textItems.push(`[${el.type}] ${plain.trim()}`);
      }
    }
  }

  if (
    textItems.length === 0 &&
    recordsSummary.length === 0 &&
    commentsSummary.length === 0
  ) {
    return {
      title: "Empty Board",
      overview:
        "The board is empty with no text, stickies, records, or comments to summarize.",
      themes: [],
      unresolvedQuestions: [],
      keyDecisions: [],
      markdown: "# Board Summary\n\nThe board is currently empty.",
    };
  }

  const prompt = `You are an AI assistant analyzing a collaborative whiteboard.
Synthesize the provided board items into a coherent executive summary.

Board Content:
${textItems.join("\n")}
${recordsSummary.length ? `\nRecords:\n${recordsSummary.join("\n")}` : ""}
${commentsSummary.length ? `\nComments:\n${commentsSummary.join("\n")}` : ""}

Respond with a JSON object conforming to:
{
  "title": "A concise title capturing the overall theme of the board",
  "overview": "A 1-2 paragraph executive summary of the ideas, discussion, and direction",
  "themes": [
    {
      "name": "Theme Name",
      "description": "Short explanation of this theme"
    }
  ],
  "unresolvedQuestions": [
    "Question 1",
    "Question 2"
  ],
  "keyDecisions": [
    "Decision 1"
  ]
}
Return JSON only.`;

  const raw = await client.completeJson<RawBoardSummary>(prompt);

  const title = raw.title || "Board Summary";
  const overview = raw.overview || "Overview of board discussions.";
  const themes = (raw.themes ?? []).map((t) => ({
    name: t.name || "Theme",
    description: t.description || "",
  }));
  const unresolvedQuestions = raw.unresolvedQuestions ?? [];
  const keyDecisions = raw.keyDecisions ?? [];

  // Build markdown representation
  const mdParts = [`# ${title}\n`, `${overview}\n`];
  if (themes.length > 0) {
    mdParts.push(`## Key Themes`);
    for (const theme of themes) {
      mdParts.push(`- **${theme.name}**: ${theme.description}`);
    }
    mdParts.push("");
  }
  if (keyDecisions.length > 0) {
    mdParts.push(`## Key Decisions`);
    for (const d of keyDecisions) {
      mdParts.push(`- ${d}`);
    }
    mdParts.push("");
  }
  if (unresolvedQuestions.length > 0) {
    mdParts.push(`## Unresolved Questions`);
    for (const q of unresolvedQuestions) {
      mdParts.push(`- ${q}`);
    }
    mdParts.push("");
  }

  return {
    title,
    overview,
    themes,
    unresolvedQuestions,
    keyDecisions,
    markdown: mdParts.join("\n").trim(),
  };
}

/**
 * Summarizes comment threads and extracts actionable items.
 */
export async function summarizeComments(
  threads: readonly CommentThread[],
  client: LlmClient,
): Promise<CommentSummaryResult> {
  const activeThreads = threads.filter((t) => t.comments.length > 0);

  if (activeThreads.length === 0) {
    return {
      summary: "No comment threads found.",
      actionItems: [],
      keyDebates: [],
      markdown: "### Comments Summary\n\nNo active comment threads.",
    };
  }

  const threadDescriptions = activeThreads.map((t, idx) => {
    const lines = t.comments.map((c) => `  - [${c.author}]: ${c.body}`);
    return `Thread #${idx + 1} (id: "${t.id}", status: ${
      t.resolved ? "resolved" : "open"
    }):\n${lines.join("\n")}`;
  });

  const prompt = `You are an AI assistant analyzing comment conversations on a whiteboard.
Summarize the discussion, identify contentious debates or consensus, and extract any actionable tasks or action items mentioned.

Comments:
${threadDescriptions.join("\n\n")}

Respond with a JSON object conforming to:
{
  "summary": "High-level summary of the discussions",
  "actionItems": [
    {
      "task": "Specific task or action item description",
      "assignee": "Name of person assigned, or null if unassigned",
      "status": "open" | "done" | "in-progress",
      "threadId": "The corresponding thread id"
    }
  ],
  "keyDebates": [
    "Discussion point or unresolved debate"
  ]
}
Return JSON only.`;

  const raw = await client.completeJson<RawCommentSummary>(prompt);

  const summary = raw.summary || "Summary of comment discussions.";
  const actionItems: ActionItem[] = (raw.actionItems ?? []).map((ai) => ({
    task: ai.task || "Action item",
    assignee: ai.assignee ?? null,
    status:
      ai.status === "done" || ai.status === "in-progress" ? ai.status : "open",
    threadId: ai.threadId || (activeThreads[0]?.id ?? ""),
  }));
  const keyDebates = raw.keyDebates ?? [];

  const mdParts = [`### Comment Threads Summary\n`, `${summary}\n`];
  if (actionItems.length > 0) {
    mdParts.push(`#### Action Items`);
    for (const ai of actionItems) {
      const assigneeStr = ai.assignee ? ` (@${ai.assignee})` : "";
      const statusIcon = ai.status === "done" ? "[x]" : "[ ]";
      mdParts.push(`- ${statusIcon} ${ai.task}${assigneeStr}`);
    }
    mdParts.push("");
  }
  if (keyDebates.length > 0) {
    mdParts.push(`#### Key Debates`);
    for (const debate of keyDebates) {
      mdParts.push(`- ${debate}`);
    }
    mdParts.push("");
  }

  return {
    summary,
    actionItems,
    keyDebates,
    markdown: mdParts.join("\n").trim(),
  };
}
