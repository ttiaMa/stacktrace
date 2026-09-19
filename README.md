# [ stacktrace ]

A small, self-hosted journal of your AI stack. One YAML file becomes a shareable timeline of the models and harnesses you use, grouped into activity rows across years of overlapping workflows.

Dark, quiet, dashboard-inspired design. No database, accounts, analytics, external fonts, CDNs, frontend framework or Node build step. Python serves a read-only API and local HTML/CSS/JavaScript; the browser draws the timeline.

> The bundled history is illustrative. Replace it with your own dates and tools.

## Create your stacktrace

[Fork or clone this repository](https://github.com/ttiaMa/stacktrace), or import its Git URL into your hosting platform. Replace the bundled `config/timeline.yaml` with your own history, then follow the setup below. Every instance includes a quiet “Create your stacktrace” link in the footer.

## Start with Docker

```sh
docker compose up -d --build
```

Open **http://localhost:8080**. Edit `config/timeline.yaml`; reload the page to load your changes, without rebuilding or restarting the server. The timeline file is mounted read-only, so atomic saves from editors work too.

```sh
# Validate configuration
docker compose exec stacktrace python -m app.server --check
# Read configuration errors
docker compose logs --tail=50 stacktrace
# Stop
docker compose down
```

Change the left side of `8080:8080` in `compose.yaml` for a different host port. The default binds all host interfaces; use `127.0.0.1:8080:8080` when your reverse proxy runs directly on the host.

## Your first timeline

Replace `config/timeline.yaml` with:

```yaml
version: 1
site:
  title: My AI stack
  description: What I use, what I tried, and why I switched.
  author: Your name
categories:
  code: Code
  chat: Chat
entries:
  - id: daily-coding
    title: Building my personal dashboard
    start: 2026-09-01
    # end: 2026-09-30  # Omit or set null while still in use.
    model: GPT Sol 5.6
    harness: Pi
    category: code
    notes: |
      Why I chose this setup, what I built, and what I learned.
      Keep the decisions and experiments worth revisiting here.
    url: https://example.com/my-dashboard
    tags: [daily-driver, personal-project]

  - id: project-conversations
    title: Thinking through the next project
    start: 2026-09-05
    model: Claude Opus 5
    harness: Hermes Agent
    category: chat
    notes: |
      Comparing ideas and turning rough notes into a plan.
    tags: [planning]
```

A **model** is the intelligence; a **harness** is the application or environment around it: a CLI, editor, chat UI or custom agent runtime. Write the model version and harness name directly in each entry. Names are yours; no separate model/harness catalog is required. Icons are matched automatically from names using bundled [Lobe Icons](https://github.com/lobehub/lobe-icons), with a character fallback for unknown tools or unavailable icons. No icon fields or external icon requests are needed.

Every entry records a period of use, not a model release date. Entries can overlap freely. Each can contain one or more models and a shared harness, or just models or a harness. To track a harness that outlasts several models, use a harness-only period and separate model periods, or create successive paired entries. Reuse the same name for the same tool; use distinct version names to preserve your history. Categories define the timeline rows (for example Code, Chat, Research and Experiments), in YAML order. Reuse a category across periods: successive periods share a lane and concurrent periods stack inside that activity row. Each period keeps its own title, notes, tags and project link; click its block to read the full story. Existing version 1 configurations work without migration.

For two models in the same period, replace the entry's `model` field with `models`:

```yaml
    harness: Cursor
    models:
      - model: GPT Sol 5.6
        role: Light coding
      - model: Claude Opus 5
        role: Heavy coding
```

The roles are optional, searchable labels; both models share the entry's dates, title, notes and project link. Use separate periods when their dates differ. Do not set both `model` and `models` on an entry.

## Features

- Full-width timeline with one row per activity and automatic lanes for overlapping periods, each sized to its own tallest block.
- Each selectable period contains its title, solid model strip and striped harness strip.
- Months is the default fixed scale, sized for model changes every one or two months. History grows horizontally and opens at its latest end instead of shrinking blocks.
- Browse older periods with the history slider, arrows or horizontal scrolling; Latest returns to the right edge. Years and Fit history provide optional overviews.
- Multiple models with optional role labels can share one period, harness and story.
- Collapsible stack overview below the story, with active tools, totals and a reading guide.
- All-time, last-year and last-90-days views; category and text filters.
- Search across titles, notes, tags, category names, tool names and model roles.
- Journal view and selectable details with notes and project links.
- Share URL retains filters, timeline scale and view. Each page visit starts with no period selected; click empty timeline space to clear a selection.
- Open-ended, completed, single-day and future/planned periods.
- Provider color defaults, named icon shortcuts and custom Unicode icons.
- Keyboard-operable controls; responsive layout with a scrollable timeline on mobile.
- Invalid edits keep the last valid configuration in memory and show a warning. The health check becomes unhealthy; a fresh start with invalid YAML returns 503.

Dates are inclusive calendar dates. Today is the server's UTC date. Future entries appear in all-time view but never count as active. Rolling windows include today and exclude future periods. Overview totals always describe the complete history. The demo spans 2023–2026 and illustrates successive periods, overlaps and two models sharing one editor period, plus [Hermes Agent](https://hermes-agent.nousresearch.com/) for chat and [Pi](https://pi.dev/) for coding. Short blocks retain a full tooltip and keyboard-accessible details; use Months scale, search or Journal to find brief experiments in a long history.

See [configuration reference](docs/configuration.md) for the full schema. Unknown fields, broken references, duplicate IDs, invalid dates and unsupported colors are rejected.

## Hosting and resources

The Docker image uses one Gunicorn worker and four threads as an unprivileged user. Compose sets a read-only filesystem, 16 MiB temporary filesystem, 128 MiB memory limit, half-CPU limit and bounded logs. These are limits, not measured consumption guarantees. No background database or build service is needed.

Route an HTTPS hostname from your reverse proxy to container port 8080. Treat `timeline.yaml` as persistent instance data: keep the live file outside the application image/release and bind-mount it at `/config/timeline.yaml` (read-only is recommended). This keeps your timeline unchanged across application updates and redeployments; the `config/timeline.yaml` included in the repository is the starter/default configuration. The mounted file must be readable by UID 10001. The app expects the root of a hostname, not a URL path prefix. HTTPS enables clipboard copying; plain HTTP uses a copy dialog. Shared links use the current hostname and do not grant access by themselves.

All supported YAML content is visible to anyone who can open your instance, including notes and project links. The raw YAML is not served. There is no login, write API or provider API access; add access control at your reverse proxy if needed.

Configuration is limited to 1 MiB, 500 items per catalog and 2,000 entries. Last-valid fallback is memory-only and does not survive a restart. API and health requests revalidate the file; the browser fetches data once when the page loads, with no background polling. Reload to see YAML changes and advance the current date. Prefer atomic file saves. This package does not publish an image or create a GitHub repo.

## Local development

Requires Python 3.11+.

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m app.server --check
python -m app.server
```

The development server listens on `127.0.0.1:8080`. Use Docker/Gunicorn for deployment. Set `STACKTRACE_CONFIG` for a different YAML path.

```sh
python -m unittest discover -s tests -v
# Optional syntax check; no npm install needed
node --check app/static/app.js
node --test tests/timeline.test.cjs
```

CI validates configuration, runs tests, builds Docker and smoke-tests routes. See [verification notes](docs/verification.md) for local checks and remaining verification limits.

## Repository layout

```text
stacktrace/
  app/
    config.py             # Safe YAML parsing and validation
    server.py             # Read-only WSGI routes and live reload
    static/               # Plain HTML, CSS and JavaScript
  config/timeline.yaml    # Your timeline's only data source
  tests/test_app.py
  docs/
  .github/workflows/ci.yml
  Dockerfile
  compose.yaml
  requirements.txt
  LICENSE
```

Design inspired by Glance's restrained dashboard aesthetic. Independent project; no Glance source or assets. MIT licensed.
