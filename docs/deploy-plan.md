# Deployment & Cost Guard Plan

This document outlines the strategy for deploying the game online safely, prioritizing strict cost controls for AI APIs (Gemini, ElevenLabs), security, and abuse prevention.

## 1. Hosting Options

The game requires a Node.js server, WebSocket support, and persistent disk storage for the SQLite database.

| Provider | Pros | Cons | Est. Cost / Mo | Secrets Management |
| :--- | :--- | :--- | :--- | :--- |
| **Render** (Web Service + Disk) | Easy GitHub integration, native persistent disks, automatic SSL, good WebSocket support. | Disk requires paid tier. | ~$7-$15 | Environment Variables via Dashboard. |
| **Fly.io** | Excellent for SQLite (LiteFS/Volumes), distributed edge deployment, very fast. | Slightly steeper learning curve for configuration (`fly.toml`). | ~$5-$10 | `fly secrets set` CLI. |
| **DigitalOcean** (Droplet/App Platform) | Full control over the VM (if Droplet), predictable pricing, easy backups. | Requires more manual server setup (if Droplet). App platform persistent storage can be pricey. | ~$6-$12 | Env vars in App Platform, or `.env` on Droplet. |

**Recommendation:** **Render** or **Fly.io** are the best fits. Fly.io is particularly well-suited for lightweight Node/SQLite apps.

## 2. Production Settings

To run securely in production, the server will be configured with:

*   **Static Serving:** The Express server will serve the built Vite client (`dist/` folder) alongside the API.
*   **HTTPS:** Handled by the hosting provider (Render/Fly) terminating TLS at the edge.
*   **Secure Cookies:** Session cookies will be set with `Secure: true`, `HttpOnly: true`, and `SameSite: 'strict'` (or `lax` if needed for OAuth).
*   **Trusted Proxy:** Express will be configured with `app.set('trust proxy', 1 /* or specific IPs */)` so rate limiters see real client IPs instead of the load balancer's IP.
*   **Origin Check:** CORS and WebSocket connections will strictly validate the `Origin` header to match our production domain.
*   **Health Check:** A lightweight `/health` endpoint will be added for the host to monitor server uptime.

## 3. Cost Guards (Crucial)

Since generative AI can rack up bills quickly, we will implement an ironclad rate-limiting and fallback system.

*   **RateLimiter Enforcement:** We will audit the codebase to ensure **every single** call to Gemini and ElevenLabs (including Sandbox mode and the Voice Changer) passes through the central `RateLimiter`.
*   **Global Daily Caps:** We will define a hard budget (e.g., $5.00/day). The server will track estimated spending.
*   **Per-Player Caps:** Individual IP addresses or session IDs will have strict daily limits (e.g., 20 API generations per day).
*   **The Global Killswitch (Fallback Mode):** If the global daily cap is hit, or an individual hits their cap, the system will automatically drop into **Fallback Mode**:
    *   No more ElevenLabs calls; audio defaults to typed-only (text-to-speech built into the browser or silent text).
    *   No more Gemini calls; callers will fall back to pre-written, scripted dialogue trees.
*   **Usage Logging:** A daily JSON or SQLite log will track usage metrics (tokens used, voice seconds generated) for monitoring.

## 4. Sandbox Mode Limits

Sandbox mode is inherently riskier for costs because players experiment.
*   **Shared Quota:** Sandbox actions draw from the same strict per-player and global quotas as the main game.
*   **Max Duration:** Generated calls in the sandbox will have strict character/time limits enforced on the server, ignoring client-requested lengths if they exceed the maximum.

## 5. Abuse Prevention

*   **IP Connection Limits:** Limit the number of concurrent WebSocket connections per IP address to prevent bot swarms.
*   **Payload Size Limits:** Express will be configured with strict JSON payload limits (e.g., `100kb`) and file upload limits (e.g., `5mb` for custom audio/images) to prevent memory exhaustion.
*   **Thundering Herd:** If traffic spikes suddenly, a queueing system or immediate Fallback Mode will be triggered to prevent the server from crashing or blowing the budget in 5 minutes.

## 6. Database Backups

*   **Automated Snapshots:** If using Render or Fly.io, we will enable automated daily disk snapshots.
*   **LiteFS (Fly.io option):** If using Fly, LiteFS can automatically replicate the SQLite database to a secondary volume or S3 bucket.
*   **Manual Export:** An admin-only API route to download a `.sqlite` backup locally.

