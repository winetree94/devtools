import { buildRouteMap } from "@stricli/core";

import { webCrawlCommand } from "#app/cli/web/crawl.ts";
import { webDocsFetchCommand } from "#app/cli/web/docs-fetch.ts";
import { webDocsSearchCommand } from "#app/cli/web/docs-search.ts";
import { webFetchCommand } from "#app/cli/web/fetch.ts";
import { webInspectCommand } from "#app/cli/web/inspect.ts";
import { webLinksCommand } from "#app/cli/web/links.ts";
import { webSearchCommand } from "#app/cli/web/search.ts";
import { webSitemapCommand } from "#app/cli/web/sitemap.ts";

const webRoutes = buildRouteMap({
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

export default webRoutes;
