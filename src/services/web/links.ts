import { z } from "zod";
import { ensureTrailingNewline } from "#app/lib/string.ts";
import { formatInputIssues } from "#app/lib/validation.ts";
import {
  type ExtractedWebPageLink,
  extractWebPageLinks,
} from "#app/services/web/link-extractor.ts";
import {
  createHtmlPageLoader,
  readCanonicalUrl,
  withHtmlDocument,
} from "#app/services/web/page.ts";
import { absoluteHttpUrlSchema } from "#app/services/web/url.ts";

type WebPageLinksRequest = Readonly<{
  url: string;
  timeoutMs: number;
  sameOriginOnly: boolean;
}>;

type WebPageLink = Readonly<{
  kind: ExtractedWebPageLink["kind"];
  url: string;
  texts: readonly string[];
  rel: readonly string[];
  targets: readonly string[];
  occurrences: number;
}>;

type WebPageLinks = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  canonicalUrl: string | undefined;
  sameOriginOnly: boolean;
  links: readonly WebPageLink[];
}>;

type WebPageLinkReader = Readonly<{
  read: (request: WebPageLinksRequest) => Promise<WebPageLinks>;
}>;

export class WebPageLinksError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebPageLinksError";
  }
}

const linksCommandSchema = z.object({
  options: z.object({
    json: z.boolean(),
    sameOrigin: z.boolean(),
    timeout: z.coerce
      .number()
      .int("Timeout must be an integer.")
      .positive("Timeout must be greater than 0."),
  }),
  url: absoluteHttpUrlSchema,
});

const parseLinksCommandInput = (input: unknown) => {
  const result = linksCommandSchema.safeParse(input);

  if (!result.success) {
    throw new WebPageLinksError(formatInputIssues(result.error.issues));
  }

  return result.data;
};

export const formatWebPageLinks = (links: WebPageLinks, json: boolean) => {
  if (json) {
    return `${JSON.stringify(links, null, 2)}\n`;
  }

  if (links.links.length === 0) {
    return ensureTrailingNewline(
      [
        `Requested URL: ${links.requestedUrl}`,
        `Final URL: ${links.finalUrl}`,
        `Canonical URL: ${links.canonicalUrl ?? ""}`.trimEnd(),
        `Same-origin only: ${links.sameOriginOnly ? "yes" : "no"}`,
        "",
        "No supported links found.",
      ].join("\n"),
    );
  }

  return ensureTrailingNewline(
    [
      `Requested URL: ${links.requestedUrl}`,
      `Final URL: ${links.finalUrl}`,
      `Canonical URL: ${links.canonicalUrl ?? ""}`.trimEnd(),
      `Same-origin only: ${links.sameOriginOnly ? "yes" : "no"}`,
      "",
      ...links.links.flatMap((link, index) => {
        const lines = [`${index + 1}. [${link.kind}] ${link.url}`];

        if (link.texts.length > 0) {
          lines.push(`   texts: ${link.texts.join(" | ")}`);
        }

        if (link.rel.length > 0) {
          lines.push(`   rel: ${link.rel.join(", ")}`);
        }

        if (link.targets.length > 0) {
          lines.push(`   targets: ${link.targets.join(", ")}`);
        }

        lines.push(`   occurrences: ${link.occurrences}`);

        return lines;
      }),
    ].join("\n"),
  );
};

export const createWebPageLinkReader = (dependencies: {
  fetchImplementation: typeof fetch;
  userAgent?: string;
}) => {
  const htmlPageLoader = createHtmlPageLoader(dependencies);

  return {
    read: async (request: WebPageLinksRequest) => {
      try {
        const page = await htmlPageLoader.load(request);

        return withHtmlDocument(page.html, page.finalUrl, (document) => {
          return {
            requestedUrl: page.requestedUrl,
            finalUrl: page.finalUrl,
            canonicalUrl: readCanonicalUrl(document, page.finalUrl),
            sameOriginOnly: request.sameOriginOnly,
            links: extractWebPageLinks(
              document,
              page.finalUrl,
              request.sameOriginOnly,
            ),
          } satisfies WebPageLinks;
        });
      } catch (error: unknown) {
        throw new WebPageLinksError(
          error instanceof Error ? error.message : "Web request failed.",
        );
      }
    },
  } satisfies WebPageLinkReader;
};

export const runWebLinksCommand = async (
  input: Readonly<{
    url: string;
    options: Record<string, unknown>;
  }>,
  dependencies: {
    webPageLinkReader: WebPageLinkReader;
  },
) => {
  const validatedInput = parseLinksCommandInput(input);
  const links = await dependencies.webPageLinkReader.read({
    url: validatedInput.url,
    timeoutMs: validatedInput.options.timeout,
    sameOriginOnly: validatedInput.options.sameOrigin,
  });

  return formatWebPageLinks(links, validatedInput.options.json);
};
