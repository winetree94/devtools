import { readStdinText, shouldReadFromStdin } from "#app/cli/stdin.ts";
import { ensureTrailingNewline } from "#app/lib/string.ts";

export const batchInputFormats = ["text", "jsonl"] as const;
export const batchOutputFormats = ["text", "jsonl"] as const;

type ResolvedUrlInputs =
  | Readonly<{
      mode: "single";
      url: string;
    }>
  | Readonly<{
      mode: "batch";
      urls: readonly string[];
    }>;

export const parseTextUrls = (input: string) => {
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
};

export const parseJsonlUrls = (input: string) => {
  const urls: string[] = [];

  for (const [index, rawLine] of input.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();

    if (line === "") {
      continue;
    }

    let value: unknown;

    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSONL input on line ${index + 1}.`);
    }

    if (typeof value !== "object" || value === null) {
      throw new Error(
        `JSONL line ${index + 1} must contain a non-empty url field.`,
      );
    }

    const { url } = value as { url?: unknown };

    if (typeof url !== "string" || url.trim() === "") {
      throw new Error(
        `JSONL line ${index + 1} must contain a non-empty url field.`,
      );
    }

    urls.push(url);
  }

  return urls;
};

export const resolveUrlCommandInputs = async (options: {
  providedUrl: string | undefined;
  stdin: boolean;
  inputFormat: string;
  missingInputMessage: string;
}) => {
  const hasPositionalInput = options.providedUrl !== undefined;

  if (!shouldReadFromStdin({ force: options.stdin, hasPositionalInput })) {
    if (options.providedUrl === undefined) {
      throw new Error(options.missingInputMessage);
    }

    return {
      mode: "single",
      url: options.providedUrl,
    } satisfies ResolvedUrlInputs;
  }

  const stdinText = await readStdinText();
  const urls =
    options.inputFormat === "jsonl"
      ? parseJsonlUrls(stdinText)
      : parseTextUrls(stdinText);

  if (urls.length === 0) {
    throw new Error("No batch inputs were provided on stdin.");
  }

  return {
    mode: "batch",
    urls,
  } satisfies ResolvedUrlInputs;
};

export const runUrlBatchCommand = async (options: {
  urls: readonly string[];
  execute: (url: string) => Promise<string>;
  batchOutput: string;
  commandId: string;
}) => {
  const lines: string[] = [];
  let hadErrors = false;

  for (const url of options.urls) {
    try {
      const output = await options.execute(url);

      if (options.batchOutput === "jsonl") {
        lines.push(
          JSON.stringify({
            command: options.commandId,
            input: { url },
            ok: true,
            output,
          }),
        );
        continue;
      }

      lines.push(`==> ${url}\n${output.trimEnd()}`);
    } catch (error: unknown) {
      hadErrors = true;
      const message =
        error instanceof Error ? error.message : "Command failed.";

      if (options.batchOutput === "jsonl") {
        lines.push(
          JSON.stringify({
            command: options.commandId,
            error: { message },
            input: { url },
            ok: false,
          }),
        );
        continue;
      }

      lines.push(`==> ${url}\nERROR: ${message}`);
    }
  }

  return {
    hadErrors,
    output: ensureTrailingNewline(lines.join("\n\n")),
  };
};
