# Stacktrace

A small, self-hosted journal of your AI stack. One YAML file becomes a shareable timeline of the models and harnesses you use, including overlapping workflows.

Dark, quiet, dashboard-inspired design. No database, accounts, analytics, external fonts, CDNs, frontend framework or Node build step. Python serves a read-only API and local HTML/CSS/JavaScript; the browser draws the timeline.

> The bundled history is illustrative. Replace it with your own dates and tools.

## Start with Docker

```sh
docker compose up -d --build
```

Open **http://localhost:8080**. Edit `config/timeline.yaml`; the page refreshes its data within 30 seconds without a rebuild or restart. The timeline file is mounted read-only, so atomic saves from editors work too.

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
models:
  my-model:
    name: Any model or version
    color: '#85b5ae'
    icon: '◇'
harnesses:
  my-tool:
    name: Any editor, CLI or chat app
    icon: terminal
    color: '#b49ace'
categories:
  coding:
    name: Code
    icon: code
entries:
  - id: first-workflow
    title: My daily workflow
    start: 2026-09-01
    # end: 2026-09-30  # Omit or set null while still in use.
    model: my-model
    harness: my-tool
    category: coding
    notes: |
      Why I chose this stack, what worked, and what changed.
    tags: [daily-driver, work]
```

A **model** is the intelligence; a **harness** is the application or environment around it: a CLI, editor, chat UI or custom agent runtime. Names and IDs are yours. There is no fixed tool catalog.

Every entry records a period of use, not a model release date. Entries can overlap freely. Each can contain a model and a harness, or just one of them. To track a harness that outlasts several models, use a harness-only period and separate model periods, or create successive paired entries. Entries can reuse the same catalog IDs.

## Features

- Two visually distinct bars: solid model, striped harness, sharing a time axis.
- Active stack sidebar, with duplicate tools consolidated.
- All-time, last-year and last-90-days views; category and text filters.
- Search across titles, notes, tags, category names and tool names.
- Journal view and selectable details with notes and project links.
- Share URL retains filters, view and selected entry.
- Open-ended, completed, single-day and future/planned periods.
- Provider color defaults, named icon shortcuts and custom Unicode icons.
- Keyboard-operable controls; responsive layout with a scrollable timeline on mobile.
- Invalid edits keep the last valid configuration in memory and show a warning. The health check becomes unhealthy; a fresh start with invalid YAML returns 503.

Dates are inclusive calendar dates. Today is the server's UTC date. Future entries appear in all-time view but never count as active. Rolling windows include today and exclude future periods. Sidebar totals always describe the complete history.

See [configuration reference](docs/configuration.md) for the full schema. Unknown fields, broken references, duplicate IDs, invalid dates and unsupported colors are rejected.

## Hosting and resources

The Docker image uses one Gunicorn worker and four threads as an unprivileged user. Compose sets a read-only filesystem, 16 MiB temporary filesystem, 128 MiB memory limit, half-CPU limit and bounded logs. These are limits, not measured consumption guarantees. No background database or build service is needed.

Route an HTTPS hostname from your reverse proxy to container port 8080. Treat `timeline.yaml` as persistent instance data: keep the live file outside the application image/release and bind-mount it at `/config/timeline.yaml` (read-only is recommended). This keeps your timeline unchanged across application updates and redeployments; the `config/timeline.yaml` included in the repository is the starter/default configuration. The mounted file must be readable by UID 10001. The app expects the root of a hostname, not a URL path prefix. HTTPS enables clipboard copying; plain HTTP uses a copy dialog. Shared links use the current hostname and do not grant access by themselves.

All supported YAML content is visible to anyone who can open your instance, including notes and project links. The raw YAML is not served. There is no login, write API or provider API access; add access control at your reverse proxy if needed.

Configuration is limited to 1 MiB, 500 items per catalog and 2,000 entries. Last-valid fallback is memory-only and does not survive a restart. API and health requests revalidate the file; each open page polls every 30 seconds. Prefer atomic file saves. This package does not publish an image or create a GitHub repo.

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
```

CI validates configuration, runs tests, builds Docker and smoke-tests routes. See [verification notes](docs/verification.md) for checks performed on this initial package.

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
