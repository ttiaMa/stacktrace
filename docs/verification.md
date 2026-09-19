# Selection and header alignment — 2026-09-19

- 7 Node renderer tests passed, including no selection from old entry URLs, selecting a block, clearing selection on timeline background clicks, and preserving scroll position.
- Browser checks confirmed a fresh unselected page and clearing details/highlight by clicking the timeline background.
- Header wordmark now has explicit centered boxes and a vector icon, avoiding font-glyph baseline differences. README and configuration reference describe visit-local selection.
- JavaScript syntax and Git whitespace checks passed. No deployment performed.

# Manual reload and compact lanes — 2026-09-19

- 15 Python and 6 Node tests passed; renderer tests reject background polling and check independent lane heights, aligned successive blocks and non-overlapping vertical placement.
- YAML validation, JavaScript syntax and Git whitespace checks passed.
- Browser verification confirmed the removed header date, [ stacktrace ] wordmark, compact model/harness strips and different heights for the two Code lanes.
- Data now loads only on page visits/reloads. Documentation and the demo comment reflect this behavior.
- No deployment or Docker build was performed.

# Long-history navigation and multi-model periods — 2026-09-18

- 15 Python tests passed, including multi-model normalization, legacy single-model compatibility, invalid lists, roles and references.
- 5 Node renderer tests passed, including fixed default scale, latest initial position, historical position preservation, zoom anchoring, shared selection, model roles, search and distinct-model totals.
- Demo YAML validated (11 periods); JavaScript syntax and Git whitespace checks passed.
- Browser checks verified initial latest position, slider keyboard navigation to the oldest history, Latest, two models and roles in one period and its details, and readable sticky labels on desktop and a 390 px viewport.
- Docker and production deployment were not run for this change.

# Activity timeline verification — 2026-09-18

- 13 Python unit/integration tests passed on Windows. Temporary-file fixtures now close files before reopening them, also supporting Windows file locking.
- 3 Node renderer regression tests passed: activity grouping, inclusive overlaps, lane reuse, multi-year width, fit scale, filtering, selection, short periods, uncategorized and future periods.
- Demo YAML validated successfully (11 periods across 2023–2026); JavaScript syntax and Git whitespace checks passed.
- Local browser checks covered narrow and 1440 px desktop layouts, Fit history, period selection and full notes, combined search/category filtering, Journal, and the collapsible overview.
- Docker build and production deployment were not run for this change. No load benchmarks were performed.

The notes below describe the original package checks, before this redesign.

# Initial verification

Checks executed while preparing this source package:

- 13 Python unit/integration tests passed: safe YAML parsing, native dates, unknown fields, missing references, duplicate IDs, invalid dates, color/URL injection, aliases, file size limit, read-only routes, HEAD/security headers, live reload, last-valid fallback and recovery.
- Example YAML validated successfully (7 periods).
- JavaScript syntax check passed with Node 24.
- Gunicorn started with one worker and four threads; real HTTP requests to `/healthz` and `/api/timeline` passed.
- Compose and GitHub Actions files parsed as YAML.

Not verified in this environment:

- Docker image build and Compose startup: Docker was unavailable. CI includes these gates and a container smoke test.
- Browser rendering, interactions and screenshots: no browser was installed and the browser download was unavailable. Responsive CSS and UI code are supplied, but visual and browser interaction QA remain to be run.
- Memory footprint and performance under load: the Compose memory/CPU settings are limits, not benchmarks.

The project has not been deployed and no GitHub repository or container registry image has been published.
