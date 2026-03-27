import { ensureTrailingNewline } from "#app/lib/string.ts";

type OutputLine = false | null | string | undefined;

const compactLines = (lines: OutputLine[]) => {
  return lines.filter(
    (line): line is string =>
      line !== undefined && line !== null && line !== false,
  );
};

export const output = (...lines: OutputLine[]) => {
  return ensureTrailingNewline(compactLines(lines).join("\n"));
};

export const writeStdout = (value: string) => {
  process.stdout.write(value);
};

export const writeStderr = (value: string) => {
  process.stderr.write(value);
};

export const formatErrorMessage = (message: Error | string) => {
  return output(message instanceof Error ? message.message : message);
};
