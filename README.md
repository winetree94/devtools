# devtools

When you are working with an AI coding agent or doing fast terminal-based research, the annoying part is rarely writing the prompt. It is collecting clean web context, narrowing results to the right docs, and reusing the same workflows without rebuilding them every time. `devtools` exists to make that part lighter: a small CLI for web research, content extraction, and reusable agent skill workflows.

It is built for the moments when you want to search official docs, inspect a page before reading it in full, extract content into a format an agent can actually use, or install shared skill templates into your local agent setup without extra ceremony.

## Installation

Requirements:

- Node.js 24+
- npm

Install dependencies:

```bash
npm install
```

Run the CLI locally:

```bash
npm run start -- --help
```

If you want a global `devtools` command on your machine:

```bash
npm link
```

To use web search, add a `.env` file in the project root:

```env
BRAVE_SEARCH_API_KEY=your_api_key_here
```

## What It Helps With

- Search the web from the terminal, including docs-focused lookups
- Fetch pages and turn them into cleaner text or markdown for agent use
- Inspect page metadata, links, sitemaps, and crawl targets before going deeper
- Install and uninstall reusable skill templates for supported coding agents

## Example Commands

```bash
devtools web search "node.js fs watch"
devtools web docs-search nodejs.org/docs "fs watch"
devtools web fetch https://example.com/article --format markdown
devtools web inspect https://example.com/article --json
devtools install skills opencode
```

## Notes

- Web search uses Brave Search
- URL-based web commands support stdin for batch workflows
- Output stays structured and automation-friendly for scripts and agents

## Development

Useful commands:

```bash
npm run typecheck
npx biome check .
npm run test
```
