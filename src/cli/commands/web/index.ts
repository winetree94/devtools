import { buildRouteMap } from "@stricli/core";

import { webCrawlCommand } from "#app/cli/commands/web/crawl.ts";
import { webDocsFetchCommand } from "#app/cli/commands/web/docs-fetch.ts";
import { webDocsSearchCommand } from "#app/cli/commands/web/docs-search.ts";
import { webFetchCommand } from "#app/cli/commands/web/fetch.ts";
import { webInspectCommand } from "#app/cli/commands/web/inspect.ts";
import { webLinksCommand } from "#app/cli/commands/web/links.ts";
import { webSearchCommand } from "#app/cli/commands/web/search.ts";
import { webSitemapCommand } from "#app/cli/commands/web/sitemap.ts";

export const webRoutes = buildRouteMap({
  docs: {
    brief: "Web utilities",
  },
  routes: {
    crawl: webCrawlCommand,
    docsFetch: webDocsFetchCommand,
    docsSearch: webDocsSearchCommand,
    fetch: webFetchCommand,
    inspect: webInspectCommand,
    links: webLinksCommand,
    search: webSearchCommand,
    sitemap: webSitemapCommand,
  },
});
