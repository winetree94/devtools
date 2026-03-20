import { describe, expect, it } from "vitest";

import { shouldReadFromStdin } from "#app/cli/stdin.ts";
import {
  parseJsonlUrls,
  parseTextUrls,
  runUrlBatchCommand,
} from "#app/cli/web/batch.ts";

describe("batch helpers", () => {
  it("parses text stdin inputs", () => {
    expect(parseTextUrls("\n https://a.test \n\nhttps://b.test\n")).toEqual([
      "https://a.test",
      "https://b.test",
    ]);
  });

  it("parses jsonl stdin inputs", () => {
    expect(
      parseJsonlUrls(
        `${JSON.stringify({ url: "https://a.test" })}\n${JSON.stringify({ url: "https://b.test" })}\n`,
      ),
    ).toEqual(["https://a.test", "https://b.test"]);
  });

  it("rejects invalid jsonl stdin inputs", () => {
    expect(() => parseJsonlUrls('{"url":123}\n')).toThrowError(
      "JSONL line 1 must contain a non-empty url field.",
    );
  });

  it("decides when stdin should be consumed", () => {
    expect(
      shouldReadFromStdin({
        force: true,
        hasPositionalInput: true,
      }),
    ).toBe(true);
    expect(
      shouldReadFromStdin({
        force: false,
        hasPositionalInput: true,
      }),
    ).toBe(false);
  });

  it("formats mixed batch results as jsonl and tracks errors", async () => {
    const result = await runUrlBatchCommand({
      batchOutput: "jsonl",
      commandId: "web:inspect",
      execute: async (url) => {
        if (url.endsWith("/bad")) {
          throw new Error("request failed");
        }

        return `ok:${url}`;
      },
      urls: ["https://a.test/good", "https://a.test/bad"],
    });

    expect(result.hadErrors).toBe(true);
    const [firstLine, secondLine] = result.output
      .trim()
      .split("\n")
      .filter(Boolean);

    expect(JSON.parse(firstLine ?? "")).toMatchObject({
      command: "web:inspect",
      input: {
        url: "https://a.test/good",
      },
      ok: true,
    });
    expect(JSON.parse(secondLine ?? "")).toMatchObject({
      error: {
        message: "request failed",
      },
      input: {
        url: "https://a.test/bad",
      },
      ok: false,
    });
  });
});
