import { z } from "zod";

import { ensureTrailingNewline, normalizeWhitespace } from "#app/lib/string.ts";
import { formatInputIssues } from "#app/lib/validation.ts";
import {
  createHtmlPageLoader,
  readCanonicalUrl,
  readDocumentTitle,
  readMetaContent,
  withHtmlDocument,
} from "#app/services/web/page.ts";
import {
  absoluteHttpUrlSchema,
  normalizeAbsoluteUrl,
} from "#app/services/web/url.ts";

export const webDocsOutputFormats = ["json", "markdown"] as const;

type WebDocsOutputFormat = (typeof webDocsOutputFormats)[number];

type WebDocsReadRequest = Readonly<{
  timeoutMs: number;
  url: string;
}>;

type WebDocsHeading = Readonly<{
  id: string;
  level: number;
  sectionId: string;
  slug: string;
  text: string;
}>;

type WebDocsParagraphBlock = Readonly<{
  id: string;
  markdown: string;
  sectionId: string;
  text: string;
  type: "paragraph";
}>;

type WebDocsListBlock = Readonly<{
  id: string;
  items: readonly string[];
  markdown: string;
  ordered: boolean;
  sectionId: string;
  text: string;
  type: "list";
}>;

type WebDocsCodeBlock = Readonly<{
  code: string;
  id: string;
  language: string | undefined;
  markdown: string;
  sectionId: string;
  text: string;
  type: "code";
}>;

type WebDocsTableBlock = Readonly<{
  caption: string | undefined;
  headers: readonly string[];
  id: string;
  markdown: string;
  rows: readonly (readonly string[])[];
  sectionId: string;
  text: string;
  type: "table";
}>;

type WebDocsBlock =
  | WebDocsParagraphBlock
  | WebDocsListBlock
  | WebDocsCodeBlock
  | WebDocsTableBlock;

type WebDocsSection = Readonly<{
  blockIds: readonly string[];
  heading: string | undefined;
  id: string;
  level: number;
  markdown: string;
  path: readonly string[];
  text: string;
}>;

type WebDocsContent = Readonly<{
  blocks: readonly WebDocsBlock[];
  canonicalUrl: string | undefined;
  codeBlocks: readonly WebDocsCodeBlock[];
  contentRoot: Readonly<{
    selector: string | undefined;
    strategy: "main" | "article" | "heuristic" | "body";
  }>;
  description: string | undefined;
  finalUrl: string;
  headings: readonly WebDocsHeading[];
  language: string | undefined;
  markdown: string;
  requestedUrl: string;
  sections: readonly WebDocsSection[];
  siteName: string | undefined;
  tables: readonly WebDocsTableBlock[];
  text: string;
  title: string | undefined;
  warnings: readonly string[];
}>;

type WebDocsReader = Readonly<{
  read: (request: WebDocsReadRequest) => Promise<WebDocsContent>;
}>;

type MutableSection = {
  blockIds: string[];
  heading: string | undefined;
  id: string;
  level: number;
  path: string[];
};

export class WebDocsReadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebDocsReadError";
  }
}

const docsFetchCommandSchema = z.object({
  options: z.object({
    format: z.enum(webDocsOutputFormats),
    timeout: z.coerce
      .number()
      .int("Timeout must be an integer.")
      .positive("Timeout must be greater than 0."),
  }),
  url: absoluteHttpUrlSchema,
});

const normalizeInlineWhitespace = (value: string) => {
  return value.replace(/\s+/gu, " ").trim();
};

const slugify = (value: string) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
};

const createTableMarkdown = (
  headers: readonly string[],
  rows: readonly (readonly string[])[],
) => {
  const width = Math.max(headers.length, ...rows.map((row) => row.length), 1);
  const normalizedHeaders =
    headers.length === 0
      ? Array.from({ length: width }, (_, index) => `Column ${index + 1}`)
      : [
          ...headers,
          ...Array.from({ length: width - headers.length }, () => ""),
        ];
  const normalizedRows = rows.map((row) => {
    return [...row, ...Array.from({ length: width - row.length }, () => "")];
  });

  return [
    `| ${normalizedHeaders.join(" | ")} |`,
    `| ${normalizedHeaders.map(() => "---").join(" | ")} |`,
    ...normalizedRows.map((row) => {
      return `| ${row.join(" | ")} |`;
    }),
  ].join("\n");
};

const inferCodeLanguage = (element: Element) => {
  for (const candidate of [
    element,
    ...Array.from(element.querySelectorAll("[class]")),
  ]) {
    for (const className of Array.from(candidate.classList)) {
      const match = /^(?:language|lang)-([a-z0-9_-]+)$/iu.exec(className);

      if (match?.[1] !== undefined) {
        return match[1].toLowerCase();
      }
    }
  }

  return undefined;
};

const serializeInlineMarkdown = (node: Node, baseUrl: string): string => {
  if (node.nodeType === 3) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== 1) {
    return "";
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === "br") {
    return "\n";
  }

  if (
    tagName === "code" &&
    element.parentElement?.tagName.toLowerCase() !== "pre"
  ) {
    return `\`${normalizeInlineWhitespace(element.textContent ?? "")}\``;
  }

  const content = Array.from(element.childNodes)
    .map((childNode) => serializeInlineMarkdown(childNode, baseUrl))
    .join("");

  switch (tagName) {
    case "strong":
    case "b":
      return `**${content.trim()}**`;
    case "em":
    case "i":
      return `*${content.trim()}*`;
    case "a": {
      const href = element.getAttribute("href");

      if (href === null || href.trim() === "") {
        return content;
      }

      try {
        return `[${content.trim() || href}](${normalizeAbsoluteUrl(new URL(href, baseUrl).toString(), { keepHash: true })})`;
      } catch {
        return content;
      }
    }
    default:
      return content;
  }
};

const readElementText = (element: Element) => {
  return normalizeWhitespace(element.textContent ?? "");
};

const readTableData = (table: HTMLTableElement, baseUrl: string) => {
  const caption = normalizeInlineWhitespace(
    table.querySelector("caption")?.textContent ?? "",
  );
  const rows = Array.from(table.querySelectorAll("tr"));

  if (rows.length === 0) {
    return undefined;
  }

  const headerRow = rows.find((row) => row.querySelector("th") !== null);
  const headers =
    headerRow === undefined
      ? []
      : Array.from(headerRow.querySelectorAll("th, td")).map((cell) => {
          return normalizeInlineWhitespace(
            serializeInlineMarkdown(cell, baseUrl),
          );
        });
  const dataRows = rows
    .filter((row) => row !== headerRow)
    .map((row) => {
      return Array.from(row.querySelectorAll("th, td")).map((cell) => {
        return normalizeInlineWhitespace(
          serializeInlineMarkdown(cell, baseUrl),
        );
      });
    })
    .filter((row) => row.length > 0);

  if (headers.length === 0 && dataRows.length === 0) {
    return undefined;
  }

  const markdown = createTableMarkdown(headers, dataRows);

  return {
    caption: caption === "" ? undefined : caption,
    headers,
    markdown,
    rows: dataRows,
    text: normalizeWhitespace(
      [caption, ...headers, ...dataRows.flat()].filter(Boolean).join("\n"),
    ),
  };
};

const pickContentRoot = (document: Document) => {
  const main = document.querySelector("main, [role='main']");

  if (main !== null) {
    return {
      element: main,
      selector: main.matches("main") ? "main" : "[role='main']",
      strategy: "main" as const,
    };
  }

  const article = document.querySelector("article");

  if (article !== null) {
    return {
      element: article,
      selector: "article",
      strategy: "article" as const,
    };
  }

  for (const selector of [
    ".content",
    ".documentation",
    ".docs",
    ".theme-doc-markdown",
  ]) {
    const element = document.querySelector(selector);

    if (element !== null) {
      return {
        element,
        selector,
        strategy: "heuristic" as const,
      };
    }
  }

  return {
    element: document.body,
    selector: undefined,
    strategy: "body" as const,
  };
};

const finalizeSections = (
  sections: readonly MutableSection[],
  blocks: readonly WebDocsBlock[],
) => {
  const finalizedSections: WebDocsSection[] = [];

  for (const section of sections) {
    const sectionBlocks = blocks.filter(
      (block) => block.sectionId === section.id,
    );
    const headingMarkdown =
      section.heading === undefined || section.level === 0
        ? undefined
        : `${"#".repeat(section.level)} ${section.heading}`;
    const markdown = [
      headingMarkdown,
      ...sectionBlocks.map((block) => block.markdown),
    ]
      .filter((part): part is string => part !== undefined && part !== "")
      .join("\n\n");
    const text = [section.heading, ...sectionBlocks.map((block) => block.text)]
      .filter((part): part is string => part !== undefined && part !== "")
      .join("\n\n");

    if (text === "" && markdown === "") {
      continue;
    }

    finalizedSections.push({
      blockIds: section.blockIds,
      heading: section.heading,
      id: section.id,
      level: section.level,
      markdown,
      path: section.path,
      text,
    });
  }

  return finalizedSections;
};

const parseStructuredDocument = (
  requestedUrl: string,
  finalUrl: string,
  html: string,
) => {
  return withHtmlDocument(html, finalUrl, (document) => {
    const contentRoot = pickContentRoot(document);
    const headings: WebDocsHeading[] = [];
    const blocks: WebDocsBlock[] = [];
    const rootSection: MutableSection = {
      blockIds: [],
      heading: undefined,
      id: "section-0",
      level: 0,
      path: [],
    };
    const sections: MutableSection[] = [rootSection];
    const warnings: string[] = [];
    const headingStack: Array<{ level: number; text: string }> = [];
    let currentSection = rootSection;
    let nextBlockId = 1;
    let nextSectionId = 1;

    const addBlock = (
      block:
        | Omit<WebDocsParagraphBlock, "id" | "sectionId">
        | Omit<WebDocsListBlock, "id" | "sectionId">
        | Omit<WebDocsCodeBlock, "id" | "sectionId">
        | Omit<WebDocsTableBlock, "id" | "sectionId">,
    ) => {
      const current = currentSection;
      const id = `block-${nextBlockId}`;
      nextBlockId += 1;
      const completedBlock = {
        ...block,
        id,
        sectionId: current.id,
      } as WebDocsBlock;

      current.blockIds.push(id);
      blocks.push(completedBlock);
    };

    const startSection = (headingElement: HTMLHeadingElement) => {
      const headingText = readElementText(headingElement);

      if (headingText === "") {
        return;
      }

      const level = Number.parseInt(headingElement.tagName.slice(1), 10);

      while ((headingStack.at(-1)?.level ?? 0) >= level) {
        headingStack.pop();
      }

      headingStack.push({ level, text: headingText });
      const slug = slugify(
        headingElement.id || headingText || `section-${nextSectionId}`,
      );
      const id = `section-${nextSectionId}`;
      nextSectionId += 1;
      currentSection = {
        blockIds: [],
        heading: headingText,
        id,
        level,
        path: headingStack.map((entry) => entry.text),
      };
      sections.push(currentSection);
      headings.push({
        id: headingElement.id || slug || id,
        level,
        sectionId: id,
        slug: slug || id,
        text: headingText,
      });
    };

    const visitElement = (element: Element) => {
      const tagName = element.tagName.toLowerCase();

      if (
        ["nav", "aside", "footer", "script", "style", "template"].includes(
          tagName,
        )
      ) {
        return;
      }

      if (/^h[1-6]$/u.test(tagName)) {
        startSection(element as HTMLHeadingElement);
        return;
      }

      if (tagName === "pre") {
        const codeElement = element.querySelector("code");
        const code = (
          codeElement?.textContent ??
          element.textContent ??
          ""
        ).trim();

        if (code !== "") {
          const language = inferCodeLanguage(codeElement ?? element);
          const fence = language === undefined ? "```" : `\`\`\`${language}`;

          addBlock({
            code,
            language,
            markdown: `${fence}\n${code}\n\`\`\``,
            text: code,
            type: "code",
          });
        }
        return;
      }

      if (tagName === "table") {
        const tableData = readTableData(element as HTMLTableElement, finalUrl);

        if (tableData !== undefined) {
          addBlock({
            caption: tableData.caption,
            headers: tableData.headers,
            markdown:
              tableData.caption === undefined
                ? tableData.markdown
                : `${tableData.caption}\n\n${tableData.markdown}`,
            rows: tableData.rows,
            text: tableData.text,
            type: "table",
          });
        }
        return;
      }

      if (tagName === "ul" || tagName === "ol") {
        const items = Array.from(element.children)
          .filter((child) => child.tagName.toLowerCase() === "li")
          .map((item) =>
            normalizeInlineWhitespace(serializeInlineMarkdown(item, finalUrl)),
          )
          .filter(Boolean);

        if (items.length > 0) {
          addBlock({
            items,
            markdown: items
              .map((item, index) => {
                return tagName === "ol" ? `${index + 1}. ${item}` : `- ${item}`;
              })
              .join("\n"),
            ordered: tagName === "ol",
            text: items.join("\n"),
            type: "list",
          });
        }
        return;
      }

      if (tagName === "p") {
        const markdown = normalizeInlineWhitespace(
          serializeInlineMarkdown(element, finalUrl),
        );
        const text = readElementText(element);

        if (text !== "") {
          addBlock({
            markdown,
            text,
            type: "paragraph",
          });
        }
        return;
      }

      if (tagName === "code") {
        return;
      }

      for (const child of Array.from(element.children)) {
        visitElement(child);
      }
    };

    visitElement(contentRoot.element);

    const finalizedSections = finalizeSections(sections, blocks);

    if (finalizedSections.length === 0) {
      warnings.push(
        "No structured content blocks were extracted from the page.",
      );
    }

    const codeBlocks = blocks.filter((block): block is WebDocsCodeBlock => {
      return block.type === "code";
    });
    const tables = blocks.filter((block): block is WebDocsTableBlock => {
      return block.type === "table";
    });
    const markdown = finalizedSections
      .map((section) => section.markdown)
      .join("\n\n")
      .trim();
    const text = finalizedSections
      .map((section) => section.text)
      .join("\n\n")
      .trim();

    return {
      blocks,
      canonicalUrl: readCanonicalUrl(document, finalUrl),
      codeBlocks,
      contentRoot: {
        selector: contentRoot.selector,
        strategy: contentRoot.strategy,
      },
      description: readMetaContent(document, 'meta[name="description"]'),
      finalUrl,
      headings,
      language: document.documentElement.lang.trim() || undefined,
      markdown,
      requestedUrl,
      sections: finalizedSections,
      siteName: readMetaContent(document, 'meta[property="og:site_name"]'),
      tables,
      text,
      title:
        readMetaContent(document, 'meta[property="og:title"]') ??
        readDocumentTitle(document),
      warnings,
    } satisfies WebDocsContent;
  });
};

const parseDocsFetchCommandInput = (input: unknown) => {
  const result = docsFetchCommandSchema.safeParse(input);

  if (!result.success) {
    throw new WebDocsReadError(formatInputIssues(result.error.issues));
  }

  return result.data;
};

export const formatWebDocsContent = (
  content: WebDocsContent,
  format: WebDocsOutputFormat,
) => {
  switch (format) {
    case "json":
      return `${JSON.stringify(content, null, 2)}\n`;
    case "markdown":
      return ensureTrailingNewline(content.markdown);
  }
};

export const createFetchWebDocsReader = (dependencies: {
  fetchImplementation: typeof fetch;
  userAgent?: string;
}) => {
  const htmlPageLoader = createHtmlPageLoader(dependencies);

  return {
    read: async (request: WebDocsReadRequest) => {
      try {
        const page = await htmlPageLoader.load(request);

        return parseStructuredDocument(
          page.requestedUrl,
          page.finalUrl,
          page.html,
        );
      } catch (error: unknown) {
        throw new WebDocsReadError(
          error instanceof Error ? error.message : "Web request failed.",
        );
      }
    },
  } satisfies WebDocsReader;
};

export const runWebDocsFetchCommand = async (
  input: Readonly<{
    url: string;
    options: Record<string, unknown>;
  }>,
  dependencies: {
    webDocsReader: WebDocsReader;
  },
) => {
  const validatedInput = parseDocsFetchCommandInput(input);
  const content = await dependencies.webDocsReader.read({
    timeoutMs: validatedInput.options.timeout,
    url: validatedInput.url,
  });

  return formatWebDocsContent(content, validatedInput.options.format);
};
