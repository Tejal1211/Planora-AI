# Security Policy

## Threat Model & Mitigations

Planora AI is designed as a local, single-user application. The following table documents the security controls implemented.

| Threat | Control | Location |
|---|---|---|
| XSS via user input | HTML tags and control characters stripped from all text fields | `schemas.ts` → `text()` helper; `ai.ts` → `clean()` |
| XSS via HTTP headers | `helmet()` sets CSP, X-Frame-Options, X-Content-Type-Options | `app.ts` line ~28 |
| CSRF | API is JSON-only (no form submissions); browsers block cross-origin JSON fetch by CORS | `app.ts` CORS config |
| SSRF | No user-controlled URLs; only `GEMINI_API_KEY` used server-side | `ai.ts` |
| SQL injection | All queries use `better-sqlite3` prepared statements and positional parameters | `repo.ts`, `app.ts` |
| Oversized body | `express.json({ limit: '100kb' })` | `app.ts` |
| AI prompt injection | User prompt is JSON-stringified and marked `USER_REQUEST`; system instructions forbid prompt override | `ai.ts` → `buildPrompt()` |
| API key leakage | `GEMINI_API_KEY` stored in `server/.env` (git-ignored); never sent to the client or logged | `.gitignore`, `ai.ts` |
| AI output injection | Model response is HTML-stripped, length-limited, and Zod-validated before use | `ai.ts` → `parseAiOutput()` |
| Resource exhaustion (AI) | In-memory rate limiter: 20 requests / 60 s / IP | `app.ts` → `aiLimit` middleware |
| Information leakage | Generic `500 Internal server error` response; stack traces logged server-side only | `app.ts` error handler |
| Path traversal | Static file serving uses `express.static` with a hard-coded `dist` path | `app.ts` |

## Supported Versions

This project is a hackathon submission. Only the current main branch is supported.

## Reporting a Vulnerability

If you find a vulnerability, please open a GitHub Issue describing the issue and steps to reproduce. For sensitive reports, contact the repository owner directly via GitHub.

## Notes for Production Deployment

This application is designed for local use. Before deploying to a public server:

1. Add authentication (e.g. session-based or JWT)
2. Replace the in-memory rate limiter with a Redis-backed solution
3. Set `CORS_ORIGINS` to your specific domain
4. Use a reverse proxy (nginx) with TLS
5. Run behind a firewall; do not expose SQLite directly
6. Enable structured logging and set up alerts for 500 errors
