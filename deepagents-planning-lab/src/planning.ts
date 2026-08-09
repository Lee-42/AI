import type { Todo } from "langchain";

const STATUS_MARKS: Record<Todo["status"], string> = {
  pending: "○",
  in_progress: "◉",
  completed: "✓"
};

export function todoSignature(todos: readonly Todo[]): string {
  return JSON.stringify(todos);
}

export function formatTodos(todos: readonly Todo[]): string {
  const lines = todos.map(
    (todo, index) =>
      `${index + 1}. ${STATUS_MARKS[todo.status]} [${todo.status}] ${todo.content}`
  );

  return ["Todo 状态更新", ...lines].join("\n");
}

export class TodoProgressReporter {
  private previousSignature: string | undefined;

  render(todos: readonly Todo[] | undefined): string | undefined {
    if (!todos || todos.length === 0) {
      return undefined;
    }

    const currentSignature = todoSignature(todos);
    if (currentSignature === this.previousSignature) {
      return undefined;
    }

    this.previousSignature = currentSignature;
    return formatTodos(todos);
  }
}

type TextContentBlock = {
  type: "text";
  text: string;
};

function isTextContentBlock(value: unknown): value is TextContentBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "text" &&
    "text" in value &&
    typeof value.text === "string"
  );
}

export function extractLastMessageText(messages: readonly unknown[]): string {
  const lastMessage = messages.at(-1);

  if (typeof lastMessage !== "object" || lastMessage === null) {
    return "";
  }

  const content = "content" in lastMessage ? lastMessage.content : undefined;

  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content.filter(isTextContentBlock).map((block) => block.text).join("\n");
}

export type VirtualTextFile = {
  content: string | string[] | Uint8Array;
};

export function readVirtualTextFile(
  files: Record<string, VirtualTextFile> | undefined,
  path: string
): string | undefined {
  const content = files?.[path]?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.join("\n");
  }

  return undefined;
}
