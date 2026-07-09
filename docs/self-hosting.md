# Self-hosting guide

How to run Family Calendar for real: an always-on machine, a public HTTPS
origin, email, and backups. The examples below use macOS with launchd and a
Cloudflare Tunnel because that's what the author runs; every piece has an
equivalent on Linux (systemd, any reverse proxy/tunnel).

Nothing here requires opening a port to the internet, renting a server, or
sending family data to a third party — the app, its database, and the
newsletter model all run on your own machine.

## 1. Prerequisites

```sh
brew install deno          # or https://deno.land for other platforms
brew install cloudflared   # if you'll publish via a Cloudflare Tunnel
brew install ollama        # optional: local model for newsletter prose
```

## 2. Environment

```sh
cp .env.template .env    # then fill in
```

Production needs `ENVIRONMENT=PROD` and `BASE_URL=https://cal.example.com`
(your public origin — emailed links and iCal feed URLs break without it), plus
the `RESEND_*` keys if you want real email. Every key is explained in the
template.

## 3. Run as a service

Build once, then keep `deno task start` (serves `_prod/` on `:8000`) alive with
your init system. On macOS that's a per-user LaunchAgent, roughly:

```xml
<key>ProgramArguments</key>
<array>
  <string>/opt/homebrew/bin/deno</string>
  <string>task</string><string>start</string>
</array>
<key>WorkingDirectory</key><string>/path/to/family-cal</string>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
```

`RunAtLoad` + `KeepAlive` give start-at-login and restart-on-crash; on Linux use
a systemd unit with `Restart=always`. Deploy updates with `deno task deploy` —
it type-checks, tests, builds to `_prod/`, restarts the service, and gates on
`/health` so a broken tree never replaces the running app (edit the `deploy`
task in `deno.json` to match your service name).

Two scheduled jobs are worth adding (launchd calendar jobs or systemd timers —
prefer schedulers that catch up runs missed while the machine slept, which cron
does not):

- **Nightly backup** — an online `sqlite3 .backup` of `.data/kv.sqlite3` into
  any synced/offsite folder, pruned to the last ~30 copies.
- **Monthly newsletter prepare** (optional) — `deno task prepare-newsletter`
  drafts the newsletter and emails admins a review link. Sending stays manual
  in `/admin/newsletters/`.

## 4. Public HTTPS origin

A Cloudflare Tunnel publishes `localhost:8000` without opening any inbound
port and without exposing your IP:

```sh
cloudflared tunnel login
cloudflared tunnel create family-cal
cloudflared tunnel route dns family-cal cal.example.com
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: family-cal
credentials-file: /path/to/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: cal.example.com
    service: http://localhost:8000
  - service: http_status:404
```

Then `cloudflared service install`. Any other HTTPS front (Tailscale Funnel, a
VPS reverse proxy, Caddy on a home IP) works too — the app only needs to be
reached over HTTPS at `BASE_URL`.

## 5. Email (Resend)

1. In Resend: Domains → Add Domain — use a subdomain like `updates.example.com`
   so sending reputation is isolated from the app hostname.
2. Add the SPF + DKIM records Resend shows (DMARC recommended).
3. Create an API key and set `RESEND_API_KEY` / `RESEND_FROM` in `.env`
   (`RESEND_FROM` must use the verified domain).
4. Test: open a draft, **Send test** delivers a preview to your own inbox.

Without these keys the app still works; mail is logged to the console.

## 6. Observability (optional)

Grafana + Loki + Tempo + Prometheus with an OTLP receiver, one container:

```sh
docker run -d --name lgtm --restart unless-stopped \
  -p 127.0.0.1:8317:3300 -p 127.0.0.1:4317:4317 -p 127.0.0.1:4318:4318 \
  -v lgtm-grafana:/data/grafana -v lgtm-prometheus:/data/prometheus -v lgtm-loki:/data/loki \
  -e GF_PATHS_DATA=/data/grafana \
  -e GF_SERVER_HTTP_PORT=3300 \
  grafana/otel-lgtm
```

Bind to `127.0.0.1` as above — a bare `-p 8317:…` exposes Grafana (default
login admin/admin) to your whole LAN. Change the admin password on first login.
`GF_SERVER_HTTP_PORT` moves Grafana off its default `:3000` inside the
container, so it never collides with a dev server (`deno task dev` also uses
`:3000`) under host-visible container networking like OrbStack's.

Enable Deno's built-in OTel on the server process (`--unstable-otel` plus
`OTEL_DENO=true`, `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` in the
service environment — Deno reads these at startup, before `--env-file` loads).
A ready-made dashboard (traffic, error rate, latency quantiles, deploy info,
live logs) is in `deploy/grafana-dashboard-family-cal.json`.

## 7. Seed data & access links

`seed/people.csv` is gitignored — your real family data stays local. Place your
CSVs under `seed/` (see the tracked `seed/groups.csv` / `seed/viewers.csv` for
the format) and run `deno task seed` once. Issue access links with
`deno task issue-link`.

## 8. Resilience checklist

- Power: on a Mac, `sudo pmset -a autorestart 1 sleep 0 womp 1`; enable
  automatic login so user agents start after an unattended reboot.
- Log rotation for the service logs (macOS: a `newsyslog.d` entry; Linux:
  `logrotate`).
- External uptime monitor (UptimeRobot, Cloudflare Health Checks) pointed at
  `https://cal.example.com/health` — the one failure local telemetry can't see
  is the whole box being down.
- Occasionally verify a backup actually boots: point `KV_PATH` at a copy and
  run `deno task start`.
