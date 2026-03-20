import { z } from "zod";

import { mapConcurrent } from "#app/lib/async.ts";
import { ensureTrailingNewline } from "#app/lib/string.ts";
import { formatInputIssues } from "#app/lib/validation.ts";
import {
  type ExtractedWebPageLink,
  extractWebPageLinks,
} from "#app/services/web/link-extractor.ts";
import {
  createHtmlPageLoader,
  readCanonicalUrl,
  readDocumentTitle,
  withHtmlDocument,
} from "#app/services/web/page.ts";
import {
  absoluteHttpUrlSchema,
  normalizeAbsoluteUrl,
} from "#app/services/web/url.ts";

export const defaultWebCrawlConcurrency = "4";
export const defaultWebCrawlMaxDepth = "2";
export const defaultWebCrawlMaxPages = "20";

type WebCrawlRequest = Readonly<{
  url: string;
  timeoutMs: number;
  sameOriginOnly: boolean;
  concurrency: number;
  maxDepth: number;
  maxPages: number;
}>;

type WebCrawlPageStatus = "ok" | "error";

type WebCrawlPage = Readonly<{
  requestedUrl: string;
  finalUrl: string | undefined;
  canonicalUrl: string | undefined;
  depth: number;
  parentUrl: string | undefined;
  title: string | undefined;
  status: WebCrawlPageStatus;
  outboundLinkCount: number;
  queuedLinkCount: number;
  error: string | undefined;
}>;

type WebCrawlStats = Readonly<{
  errors: number;
  queuedPages: number;
  skippedDuplicates: number;
  skippedExternal: number;
  skippedFragments: number;
  visitedPages: number;
}>;

type WebCrawlResult = Readonly<{
  requestedUrl: string;
  sameOriginOnly: boolean;
  concurrency: number;
  maxDepth: number;
  maxPages: number;
  pages: readonly WebCrawlPage[];
  stats: WebCrawlStats;
}>;

type WebCrawler = Readonly<{
  crawl: (request: WebCrawlRequest) => Promise<WebCrawlResult>;
}>;

type CrawlQueueItem = Readonly<{
  depth: number;
  parentUrl: string | undefined;
  url: string;
}>;

type LoadedCrawlPage = Readonly<{
  canonicalUrl: string | undefined;
  finalUrl: string;
  links: readonly ExtractedWebPageLink[];
  title: string | undefined;
}>;

export class WebCrawlError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebCrawlError";
  }
}

const crawlCommandSchema = z.object({
  options: z.object({
    concurrency: z.coerce
      .number()
      .int("Concurrency must be an integer.")
      .positive("Concurrency must be greater than 0."),
    json: z.boolean(),
    "max-depth": z.coerce
      .number()
      .int("Max depth must be an integer.")
      .min(0, "Max depth must be 0 or greater."),
    "max-pages": z.coerce
      .number()
      .int("Max pages must be an integer.")
      .positive("Max pages must be greater than 0."),
    "same-origin": z.boolean(),
    timeout: z.coerce
      .number()
      .int("Timeout must be an integer.")
      .positive("Timeout must be greater than 0."),
  }),
  url: absoluteHttpUrlSchema,
});

const parseCrawlCommandInput = (input: unknown) => {
  const result = crawlCommandSchema.safeParse(input);

  if (!result.success) {
    throw new WebCrawlError(formatInputIssues(result.error.issues));
  }

  return result.data;
};

const formatField = (label: string, value: string | number | undefined) => {
  return `${label}: ${value ?? ""}`.trimEnd();
};

const readCrawlableLinks = (
  links: readonly ExtractedWebPageLink[],
  request: {
    sameOriginOnly: boolean;
    seenUrls: Set<string>;
    seenFinalUrls: Set<string>;
  },
) => {
  const nextUrls: string[] = [];
  let skippedDuplicates = 0;
  let skippedExternal = 0;
  let skippedFragments = 0;

  for (const link of links) {
    if (link.kind === "fragment") {
      skippedFragments += 1;
      continue;
    }

    if (request.sameOriginOnly && link.kind === "external") {
      skippedExternal += 1;
      continue;
    }

    if (request.seenUrls.has(link.url) || request.seenFinalUrls.has(link.url)) {
      skippedDuplicates += 1;
      continue;
    }

    request.seenUrls.add(link.url);
    nextUrls.push(link.url);
  }

  nextUrls.sort((left, right) => left.localeCompare(right));

  return {
    nextUrls,
    skippedDuplicates,
    skippedExternal,
    skippedFragments,
  };
};

export const formatWebCrawlResult = (
  crawlResult: WebCrawlResult,
  json: boolean,
) => {
  if (json) {
    return `${JSON.stringify(crawlResult, null, 2)}\n`;
  }

  return ensureTrailingNewline(
    [
      formatField("Requested URL", crawlResult.requestedUrl),
      formatField(
        "Same-origin only",
        crawlResult.sameOriginOnly ? "yes" : "no",
      ),
      formatField("Concurrency", crawlResult.concurrency),
      formatField("Max depth", crawlResult.maxDepth),
      formatField("Max pages", crawlResult.maxPages),
      formatField("Visited pages", crawlResult.stats.visitedPages),
      formatField("Queued pages", crawlResult.stats.queuedPages),
      formatField("Skipped duplicates", crawlResult.stats.skippedDuplicates),
      formatField("Skipped external", crawlResult.stats.skippedExternal),
      formatField("Skipped fragments", crawlResult.stats.skippedFragments),
      formatField("Errors", crawlResult.stats.errors),
      "",
      ...crawlResult.pages.flatMap((page, index) => {
        return [
          `${index + 1}. [${page.status}] ${page.finalUrl ?? page.requestedUrl}`,
          `   depth: ${page.depth}`,
          `   parent: ${page.parentUrl ?? ""}`.trimEnd(),
          `   title: ${page.title ?? ""}`.trimEnd(),
          `   canonical: ${page.canonicalUrl ?? ""}`.trimEnd(),
          `   outbound links: ${page.outboundLinkCount}`,
          `   queued links: ${page.queuedLinkCount}`,
          `   error: ${page.error ?? ""}`.trimEnd(),
        ].filter((line) => {
          return !line.endsWith(": ");
        });
      }),
    ].join("\n"),
  );
};

export const createWebCrawler = (dependencies: {
  fetchImplementation: typeof fetch;
  userAgent?: string;
}) => {
  const htmlPageLoader = createHtmlPageLoader(dependencies);

  const loadPage = async (queueItem: CrawlQueueItem, timeoutMs: number) => {
    const page = await htmlPageLoader.load({
      timeoutMs,
      url: queueItem.url,
    });

    return withHtmlDocument(page.html, page.finalUrl, (document) => {
      return {
        canonicalUrl: readCanonicalUrl(document, page.finalUrl),
        finalUrl: page.finalUrl,
        links: extractWebPageLinks(document, page.finalUrl, false),
        title: readDocumentTitle(document),
      } satisfies LoadedCrawlPage;
    });
  };

  return {
    crawl: async (request: WebCrawlRequest) => {
      try {
        const requestedUrl = normalizeAbsoluteUrl(request.url, {
          keepHash: true,
        });
        const seenRequestedUrls = new Set<string>([requestedUrl]);
        const seenFinalUrls = new Set<string>();
        const pages: WebCrawlPage[] = [];
        const stats = {
          errors: 0,
          queuedPages: 1,
          skippedDuplicates: 0,
          skippedExternal: 0,
          skippedFragments: 0,
          visitedPages: 0,
        };
        let frontier: CrawlQueueItem[] = [
          {
            depth: 0,
            parentUrl: undefined,
            url: requestedUrl,
          },
        ];

        while (frontier.length > 0 && pages.length < request.maxPages) {
          const currentDepth = frontier[0]?.depth;

          if (currentDepth === undefined || currentDepth > request.maxDepth) {
            break;
          }

          const currentLevel = frontier.filter(
            (item) => item.depth === currentDepth,
          );
          frontier = frontier.slice(currentLevel.length);
          const remainingCapacity = request.maxPages - pages.length;
          const batch = currentLevel
            .slice(0, remainingCapacity)
            .sort((left, right) => left.url.localeCompare(right.url));

          const loadedPages = await mapConcurrent(
            batch,
            request.concurrency,
            async (queueItem) => {
              try {
                const loadedPage = await loadPage(queueItem, request.timeoutMs);

                return {
                  loadedPage,
                  queueItem,
                } as const;
              } catch (error: unknown) {
                return {
                  error:
                    error instanceof Error
                      ? error.message
                      : "Web request failed.",
                  queueItem,
                } as const;
              }
            },
          );

          for (const loadedPage of loadedPages) {
            stats.visitedPages += 1;

            if ("error" in loadedPage) {
              stats.errors += 1;
              pages.push({
                canonicalUrl: undefined,
                depth: loadedPage.queueItem.depth,
                error: loadedPage.error,
                finalUrl: undefined,
                outboundLinkCount: 0,
                parentUrl: loadedPage.queueItem.parentUrl,
                queuedLinkCount: 0,
                requestedUrl: loadedPage.queueItem.url,
                status: "error",
                title: undefined,
              });
              continue;
            }

            seenRequestedUrls.add(loadedPage.loadedPage.finalUrl);
            seenFinalUrls.add(loadedPage.loadedPage.finalUrl);

            const crawlableLinks = readCrawlableLinks(
              loadedPage.loadedPage.links,
              {
                sameOriginOnly: request.sameOriginOnly,
                seenFinalUrls,
                seenUrls: seenRequestedUrls,
              },
            );

            stats.skippedDuplicates += crawlableLinks.skippedDuplicates;
            stats.skippedExternal += crawlableLinks.skippedExternal;
            stats.skippedFragments += crawlableLinks.skippedFragments;

            const nextDepth = loadedPage.queueItem.depth + 1;
            const nextFrontierItems =
              nextDepth > request.maxDepth
                ? []
                : crawlableLinks.nextUrls.map((url) => {
                    return {
                      depth: nextDepth,
                      parentUrl: loadedPage.loadedPage.finalUrl,
                      url,
                    } satisfies CrawlQueueItem;
                  });

            frontier.push(...nextFrontierItems);
            stats.queuedPages += nextFrontierItems.length;
            pages.push({
              canonicalUrl: loadedPage.loadedPage.canonicalUrl,
              depth: loadedPage.queueItem.depth,
              error: undefined,
              finalUrl: loadedPage.loadedPage.finalUrl,
              outboundLinkCount: loadedPage.loadedPage.links.length,
              parentUrl: loadedPage.queueItem.parentUrl,
              queuedLinkCount: nextFrontierItems.length,
              requestedUrl: loadedPage.queueItem.url,
              status: "ok",
              title: loadedPage.loadedPage.title,
            });
          }

          frontier.sort((left, right) => left.url.localeCompare(right.url));
        }

        return {
          concurrency: request.concurrency,
          maxDepth: request.maxDepth,
          maxPages: request.maxPages,
          pages,
          requestedUrl,
          sameOriginOnly: request.sameOriginOnly,
          stats,
        } satisfies WebCrawlResult;
      } catch (error: unknown) {
        throw new WebCrawlError(
          error instanceof Error ? error.message : "Web crawl failed.",
        );
      }
    },
  } satisfies WebCrawler;
};

export const runWebCrawlCommand = async (
  input: Readonly<{
    url: string;
    options: Record<string, unknown>;
  }>,
  dependencies: {
    webCrawler: WebCrawler;
  },
) => {
  const validatedInput = parseCrawlCommandInput(input);
  const crawlResult = await dependencies.webCrawler.crawl({
    concurrency: validatedInput.options.concurrency,
    maxDepth: validatedInput.options["max-depth"],
    maxPages: validatedInput.options["max-pages"],
    sameOriginOnly: validatedInput.options["same-origin"],
    timeoutMs: validatedInput.options.timeout,
    url: validatedInput.url,
  });

  return formatWebCrawlResult(crawlResult, validatedInput.options.json);
};
