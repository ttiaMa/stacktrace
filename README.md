# [ stacktrace ]

A self-hosted journal of your AI stack: the models you used, the tools around them, and the work you made together.

Every period can be a small blog post, with a title, a longer story, tags and a link to a project or further reading. Write about an experiment, explain a switch, or document how a tool helped you build something. Browse those stories in the Journal, or explore when they happened on a timeline grouped by activity. One YAML file holds it all.

Dark, quiet, dashboard-inspired design. No database, accounts, analytics, external fonts, CDNs, frontend framework or Node build step. Python serves a read-only API and local HTML/CSS/JavaScript; the browser draws the timeline.

> The bundled history is illustrative. Replace it with your own dates and tools.

## Create your stacktrace

[Fork or clone this repository](https://github.com/ttiaMa/stacktrace), or import its Git URL into your hosting platform. Replace the bundled `config/timeline.yaml` with your own history, then follow the setup below. Every instance includes a quiet “Create your stacktrace” link in the footer.

## Start with Docker

Download `compose.release.yaml` and `timeline.yaml` from the [latest release](https://github.com/ttiaMa/stacktrace/releases/latest). Put the timeline in `config/timeline.yaml` next to the Compose file, then run:

```sh
docker compose -f compose.release.yaml up -d
```

Open **http://localhost:8080**. The prebuilt image is `ghcr.io/ttiama/stacktrace:0.1`, available for Linux AMD64 and ARM64 without a registry login. No local build or repository clone is needed.

Edit `config/timeline.yaml`; reload the page to load your changes, without rebuilding or restarting the server. Categories, search, scale and display modes use the snapshot already loaded in the browser; they do not reload the page or request new timeline data. The timeline is mounted read-only. If your editor replaces the file atomically, recreate the container to refresh its file mount (`docker compose -f compose.release.yaml up -d --force-recreate`).

```sh
# Validate configuration
docker compose -f compose.release.yaml exec stacktrace python -m app.server --check
# Read configuration errors
docker compose -f compose.release.yaml logs --tail=50 stacktrace
# Stop
docker compose -f compose.release.yaml down
```

Change the left side of `8080:8080` in `compose.release.yaml` for a different host port. The default binds all host interfaces; use `127.0.0.1:8080:8080` when your reverse proxy runs directly on the host.

### Stable updates

Published/stable installations use `compose.release.yaml`, explicitly pinned to the current stable image, `ghcr.io/ttiama/stacktrace:0.1`. When a new release is published, maintainers manually update its image tag. To upgrade, download the updated Compose file, then pull and recreate the container:

```sh
docker compose -f compose.release.yaml pull
docker compose -f compose.release.yaml up -d
```

Your bind-mounted YAML stays separate from the image.

### Build from source or deploy with Coolify

Development and Coolify deployments build from source using `compose.yaml` (`build: .`, `image: stacktrace:local`). Clone/import this repository and use `docker compose up -d --build`. This Compose file exposes container port **8080** to the proxy without publishing a host port; in Coolify, route your hostname to that port. For direct access without a proxy, add a `ports: ["8080:8080"]` mapping to that Compose file. Keep the live YAML outside the application checkout when redeploying.

## Your first timeline

Replace `config/timeline.yaml` with:

```yaml
version: 1
site:
  language: en # en, it, es, fr, de
  title: My AI stack
  description: What I use, what I tried, and why I switched.
  author: Your name
  # url: https://github.com/your-username  # Optional link on the author name.
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

A **model** is the intelligence; a **harness** is the application or environment around it: a CLI, editor, chat UI or custom agent runtime. Write the model version and harness name directly in each entry. Names are yours; no separate model/harness catalog is required. Icons are matched automatically from names using bundled [Lobe Icons](https://github.com/lobehub/lobe-icons), with a character fallback for unknown tools or unavailable icons. No icon fields or external icon requests are needed. Set `site.url` to link the author name above the title to your profile, website or project; omit it for plain text.

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

Set `site.language` to `en`, `it`, `es`, `fr` or `de` (default: `en`). Reload the page to apply it. Interface labels, dates, tooltips, statistics and accessibility labels follow this setting; your titles, notes, categories, tags, model names and roles remain exactly as authored.

## Features

- Multi-year activity timeline with overlapping workflows and adjustable time scales.
- Journal entries with titles, stories, tags and links to related work.
- Multiple models and roles within a shared harness and period.
- Search, activity filters and shareable views.
- Current stack and all-time usage statistics.
- One editable YAML file, automatic local brand icons, and lightweight self-hosting.

Dates are inclusive calendar dates. Today is the server's UTC date. Future entries appear in the timeline but never count as active. The Stats section in the top navigation shows current tools and all-time totals, independently of journal filters. The demo spans 2023–2026 and illustrates successive periods, overlaps and two models sharing one editor period, plus [Hermes Agent](https://hermes-agent.nousresearch.com/) for chat and [Pi](https://pi.dev/) for coding. Short blocks show their dates on hover and retain keyboard-accessible details; use Months scale, search or Journal to find brief experiments in a long history.

See [configuration reference](docs/configuration.md) for the full schema. Unknown fields, broken references, duplicate IDs, invalid dates and unsupported colors are rejected.

Stats shows global model, harness and period counts (including planned periods), plus distinct days covered through today. Current rotation separates active models from harnesses and shows their current continuous run in inclusive calendar days. Overlapping or consecutive periods join into one run, even across activities; a gap of at least one uncovered day resets it. Stack insights shows the first recorded date, latest period start or first day after a period ended, average elapsed period duration, most-used tools and the first models/harnesses recorded. Durations use inclusive dates, stop at today and exclude future periods. Overlapping days count once for tracked days and each tool’s total; average duration counts each started period separately. Tied tools are shown together. These dates come from period history, not file edits.

The info button next to Share shows the instance's application version and a short timeline guide. The application version is separate from the YAML schema `version: 1`.

## Hosting and resources

The Docker image uses one Gunicorn worker and four threads as an unprivileged user. Compose sets a read-only filesystem, 16 MiB temporary filesystem, 128 MiB memory limit, half-CPU limit and bounded logs. These are limits, not measured consumption guarantees. No background database or build service is needed.

Route an HTTPS hostname from your reverse proxy to container port 8080. Treat `timeline.yaml` as persistent instance data: keep the live file outside the application image/release and bind-mount it at `/config/timeline.yaml` (read-only is recommended). This keeps your timeline unchanged across application updates and redeployments; the `config/timeline.yaml` included in the repository is the starter/default configuration. The mounted file must be readable by UID 10001. The app expects the root of a hostname, not a URL path prefix. HTTPS enables clipboard copying; plain HTTP uses a copy dialog. Shared links use the current hostname and do not grant access by themselves.

All supported YAML content is visible to anyone who can open your instance, including notes and project links. The raw YAML is not served. There is no login, write API or provider API access; add access control at your reverse proxy if needed.

Configuration is limited to 1 MiB, 500 items per catalog and 2,000 entries. Last-valid fallback is memory-only and does not survive a restart. API and health requests revalidate the file; the browser fetches data once when the page loads, with no background polling. Reload to see YAML changes and advance the current date. For Docker file mounts, follow the atomic-save note above.

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
node --check app/static/i18n.js
node --test tests/timeline.test.cjs
```

CI validates configuration, runs tests, builds Docker and smoke-tests routes. Normal commits and pushes to development branches do not publish a release. Releases are published only when a version tag such as `v0.2.0` is pushed and these checks pass; first set `app.__version__` to the matching release version (`0.2.0`, without `-dev`). See [verification notes](docs/verification.md) for local checks and remaining verification limits.

## Repository layout

```text
stacktrace/
  app/
    config.py             # Safe YAML parsing and validation
    server.py             # Read-only WSGI routes and YAML validation
    static/               # Plain HTML, CSS and JavaScript
  config/timeline.yaml    # Your timeline's only data source
  tests/test_app.py
  docs/
  .github/workflows/ci.yml
  Dockerfile
  compose.yaml            # Source build / reverse proxy
  compose.release.yaml    # Prebuilt, versioned image
  requirements.txt
  LICENSE
```

Design inspired by Glance's restrained dashboard aesthetic. Independent project; no Glance source or assets. MIT licensed.
