import { buildRouteMap } from "@stricli/core";

import { webCrawlCommand } from "#app/cli/web/crawl.js";
import { webDocsFetchCommand } from "#app/cli/web/docs-fetch.js";
import { webDocsSearchCommand } from "#app/cli/web/docs-search.js";
import { webFetchCommand } from "#app/cli/web/fetch.js";
import { webInspectCommand } from "#app/cli/web/inspect.js";
import { webLinksCommand } from "#app/cli/web/links.js";
import { webSearchCommand } from "#app/cli/web/search.js";
import { webSitemapCommand } from "#app/cli/web/sitemap.js";

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
