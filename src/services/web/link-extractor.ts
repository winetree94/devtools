import {
  normalizeWhitespace,
  readOptionalString,
  splitTokens,
} from "#app/lib/string.ts";
import {
  isSameOriginUrl,
  normalizeAbsoluteUrl,
} from "#app/services/web/url.ts";

export const webPageLinkKinds = [
  "same-origin",
  "fragment",
  "external",
] as const;

export type WebPageLinkKind = (typeof webPageLinkKinds)[number];

export type ExtractedWebPageLink = Readonly<{
  kind: WebPageLinkKind;
  url: string;
  texts: readonly string[];
  rel: readonly string[];
  targets: readonly string[];
  occurrences: number;
}>;

const unsupportedHrefPattern = /^(?:javascript:|mailto:|tel:|data:)/iu;

const kindOrder = new Map<WebPageLinkKind, number>([
  ["same-origin", 0],
  ["fragment", 1],
  ["external", 2],
]);

const readLinkText = (element: HTMLAnchorElement) => {
  const text = normalizeWhitespace(element.textContent ?? "");

  if (text !== "") {
    return text;
  }

  return (
    readOptionalString(element.getAttribute("aria-label")) ??
    readOptionalString(element.getAttribute("title"))
  );
};

const resolveLink = (href: string, finalUrl: string) => {
  if (unsupportedHrefPattern.test(href)) {
    return undefined;
  }

  let resolvedUrl: URL;

  try {
    resolvedUrl = new URL(href, finalUrl);
  } catch {
    return undefined;
  }

  const kind: WebPageLinkKind = href.startsWith("#")
    ? "fragment"
    : isSameOriginUrl(resolvedUrl.toString(), finalUrl)
      ? "same-origin"
      : "external";

  return {
    kind,
    url: normalizeAbsoluteUrl(resolvedUrl.toString(), {
      keepHash: kind === "fragment",
    }),
  };
};

const appendUnique = (items: string[], item: string | undefined) => {
  if (item === undefined || items.includes(item)) {
    return;
  }

  items.push(item);
  items.sort((left, right) => left.localeCompare(right));
};

export const extractWebPageLinks = (
  document: Document,
  finalUrl: string,
  sameOriginOnly: boolean,
) => {
  const groupedLinks = new Map<
    string,
    {
      kind: WebPageLinkKind;
      url: string;
      texts: string[];
      rel: string[];
      targets: string[];
      occurrences: number;
    }
  >();

  for (const element of Array.from(
    document.querySelectorAll<HTMLAnchorElement>("a[href]"),
  )) {
    const href = element.getAttribute("href")?.trim();

    if (href === undefined || href === "") {
      continue;
    }

    const resolvedLink = resolveLink(href, finalUrl);

    if (resolvedLink === undefined) {
      continue;
    }

    if (
      sameOriginOnly &&
      resolvedLink.kind !== "same-origin" &&
      resolvedLink.kind !== "fragment"
    ) {
      continue;
    }

    const key = `${resolvedLink.kind}:${resolvedLink.url}`;
    const existingLink = groupedLinks.get(key);

    if (existingLink === undefined) {
      const texts: string[] = [];
      const rel = splitTokens(element.getAttribute("rel"));
      const targets: string[] = [];

      appendUnique(texts, readLinkText(element));
      appendUnique(targets, readOptionalString(element.getAttribute("target")));

      groupedLinks.set(key, {
        kind: resolvedLink.kind,
        url: resolvedLink.url,
        texts,
        rel,
        targets,
        occurrences: 1,
      });
      continue;
    }

    appendUnique(existingLink.texts, readLinkText(element));

    for (const relValue of splitTokens(element.getAttribute("rel"))) {
      appendUnique(existingLink.rel, relValue);
    }

    appendUnique(
      existingLink.targets,
      readOptionalString(element.getAttribute("target")),
    );
    existingLink.occurrences += 1;
  }

  return [...groupedLinks.values()]
    .sort((left, right) => {
      const kindDifference =
        (kindOrder.get(left.kind) ?? Number.POSITIVE_INFINITY) -
        (kindOrder.get(right.kind) ?? Number.POSITIVE_INFINITY);

      if (kindDifference !== 0) {
        return kindDifference;
      }

      return left.url.localeCompare(right.url);
    })
    .map((link) => {
      return {
        kind: link.kind,
        url: link.url,
        texts: link.texts,
        rel: link.rel,
        targets: link.targets,
        occurrences: link.occurrences,
      } satisfies ExtractedWebPageLink;
    });
};
