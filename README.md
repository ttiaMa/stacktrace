# [ stacktrace ]

A self-hosted journal of your AI stack: the models you use, the tools around them, and the work you make together.

Write a story for each period, browse it in the Journal, explore it on the timeline, and see your current tools and history in Stats. Everything lives in one YAML file. No database, accounts, analytics or frontend build step.

## Get started

### Published Docker image

Download `compose.release.yaml` and the starter `timeline.yaml` from the [latest release](https://github.com/ttiaMa/stacktrace/releases/latest). Arrange them like this:

```text
compose.release.yaml
config/
  timeline.yaml
```

Then start the app:

```sh
docker compose -f compose.release.yaml up -d
```

The Compose file pins a stable image from `ghcr.io/ttiama/stacktrace`, available for Linux AMD64 and ARM64. No local build is needed.

Route your reverse proxy to container port **8080** on the same Docker network. No host port is published by default. For direct local access at **http://localhost:8080**, add `ports: ["127.0.0.1:8080:8080"]` to the `stacktrace` service in your local Compose file.

The bind mount requires `./config/timeline.yaml` to exist on the deployment host. Keep this file available across deployments and back up your own history.

### Run from source

Clone [this repository](https://github.com/ttiaMa/stacktrace). With Python 3.11+:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m app.server --check
python -m app.server
```

On Windows PowerShell, activate the environment with `.venv\Scripts\Activate.ps1`. Open **http://localhost:8080**. Set `STACKTRACE_CONFIG` to use a different YAML file. The built-in server is for development; use a production WSGI server such as Gunicorn for hosting.

For a source build with Docker, run `docker compose up -d --build`. This uses `compose.yaml`; the same networking instructions above apply.

## Write your history

Replace the bundled example in `config/timeline.yaml` with your own entries:

```yaml
version: 1
site:
  language: en # en, it, es, fr, de
  title: My AI stack
  description: What I use, what I tried, and why I switched.
  author: Your name
  # url: https://github.com/your-username
categories:
  code: Code
entries:
  - id: daily-coding
    title: Building my personal dashboard
    start: 2026-09-01
    # end: 2026-09-30 # Omit while still in use.
    model: GPT Sol 5.6
    harness: Pi
    category: code
    notes: |
      What I built, why I chose this setup, and what I learned.
    url: https://example.com/my-dashboard
    tags: [daily-driver, personal-project]
```

A **model** is the AI; a **harness** is the app around it, such as an editor, CLI or chat interface. Each entry can contain models, a harness, or both. Names are yours, and icons are matched automatically using bundled [Lobe Icons](https://github.com/lobehub/lobe-icons).

Periods can overlap. Use the same tool name consistently to keep its history together. For multiple models in one period, replace `model` with:

```yaml
    models:
      - model: GPT Sol 5.6
        role: Light coding
      - model: Claude Opus 5
        role: Heavy coding
```

Set `site.language` to English, Italian, Spanish, French or German using the codes in the example. Interface text is translated; your stories and tool names stay as written.

Edit the YAML and reload the page to see changes. For Docker bind mounts, if your editor replaces the file rather than updating it in place, recreate the container:

```sh
docker compose -f compose.release.yaml up -d --force-recreate
```

See the [configuration reference](docs/configuration.md) for all fields and validation rules.

## Explore your stack

- **Timeline:** periods grouped by activity, with search, filters and adjustable scales. Hover for titles and dates; select a period for its story.
- **Journal:** read your stories, tags and project links.
- **Stats:** global totals, current models and harnesses, continuous usage duration and highlights from your history.

Dates are inclusive and use the server’s UTC date. Stats are independent of Journal filters. Recorded totals include planned periods; elapsed durations stop at today and exclude future periods. Overlapping days count once per tool. Consecutive periods extend a continuous run; a day without recorded use resets it. Average duration counts each started period separately, including ongoing ones. Statistics describe recorded periods, not measured hours of use.

## Update and troubleshoot

For a stable installation, download the updated `compose.release.yaml` from the [latest release](https://github.com/ttiaMa/stacktrace/releases/latest). Keep your own `config/timeline.yaml` and any local networking changes, then run:

```sh
docker compose -f compose.release.yaml pull
docker compose -f compose.release.yaml up -d
```

To check the configuration or inspect errors:

```sh
docker compose -f compose.release.yaml exec stacktrace python -m app.server --check
docker compose -f compose.release.yaml logs --tail=50 stacktrace
```

## Hosting notes

- The container reads `/config/timeline.yaml`; the mounted file must be readable by UID **10001**. Keep your history outside the image so updates do not replace it.
- Serve the app at the root of a hostname, with HTTPS. There is no login: all configured stories and links are public to anyone who can reach the app. Add access control at your reverse proxy if needed.
- The API is read-only. There is no background polling; reload to refresh data. Invalid edits retain the last valid configuration in memory until corrected or the server restarts.

## Development and releases

```sh
python -m unittest discover -s tests -v
node --check app/static/app.js
node --check app/static/i18n.js
node --test tests/timeline.test.cjs
```

Node is needed only for these frontend checks; no npm install is required. CI also builds Docker and smoke-tests the container.

`compose.yaml` builds from source; `compose.release.yaml` pins the published stable image. Normal commits and branch pushes do not publish releases. Pushing a `v`-prefixed version tag triggers image publication after checks pass; the tag must match `app.__version__`. Maintainers update the stable Compose image tag for each release.

See [verification notes](docs/verification.md) for previous checks and their limits.

---

Design inspired by Glance’s restrained dashboard aesthetic. Independent project; no Glance source or assets. MIT licensed.
