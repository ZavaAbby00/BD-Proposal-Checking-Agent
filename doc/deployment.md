# Deployment & Operations

## Deployed environment

| | |
|---|---|
| Live URL | https://proposal-agent-73183888096.asia-southeast2.run.app — hosted demo available until **29 May 2026** |
| GCP project | `elivision-ai-1` · region `asia-southeast2` |
| Cloud Run service | `proposal-agent` — 1 vCPU / 1 GiB · min 0 / max 5 · `--no-cpu-throttling` |
| Runtime service account | `dev-zava@elivision-ai-1.iam.gserviceaccount.com` |
| Database | Cloud SQL `elibot-vector-databases-dev` (Postgres 15), database `dev-zava` |
| Image registry | Artifact Registry repo `proposal-agent` |
| Object storage | GCS bucket `elipedia` |
| Secrets | Secret Manager: `proposal-database-url`, `proposal-auth-secret`, `proposal-google-secret`, `proposal-langfuse-secret` |

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection. On Cloud Run, the Cloud SQL socket form: `postgresql://user:pwd@localhost/db?host=/cloudsql/<connection-name>&schema=public` |
| `AUTH_SECRET` | yes | Auth.js session-signing secret — `openssl rand -base64 32` |
| `AUTH_URL` | on Cloud Run | The service URL — otherwise Auth.js resolves the OAuth callback to `localhost:8080` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth Web client |
| `SUPERADMIN_EMAILS` | yes | Comma-separated break-glass platform-admin emails |
| `GOOGLE_CLOUD_PROJECT` | yes | Vertex AI project |
| `VERTEX_LOCATION` | — | Vertex region (default `global`) |
| `GEMINI_MODEL` | — | Default `gemini-3.5-flash` (also editable per-org in the admin panel) |
| `GCS_BUCKET` | — | Object storage bucket; if unset, a local `.uploads/` directory is used |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_HOST` | — | Tracing; disabled if the keys are unset |
| `MCP_API_KEY` | — | Only for the local stdio MCP server |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | Local dev only; on Cloud Run the runtime service account is used (ADC) |

Sensitive values (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_SECRET`, `LANGFUSE_SECRET_KEY`)
are stored in Secret Manager and mounted with `--set-secrets`; the rest are plain env vars.

> **Gotcha:** a global `GOOGLE_API_KEY` makes the Vertex SDK attempt API-key auth, which
> Vertex rejects (HTTP 401). `src/engine/llm.ts` scrubs it before constructing the model.

## One-time GCP setup

```bash
# APIs
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com \
  secretmanager.googleapis.com sqladmin.googleapis.com

# Runtime service account + roles
gcloud iam service-accounts create dev-zava --display-name=dev_zava
SA=dev-zava@elivision-ai-1.iam.gserviceaccount.com
for R in roles/aiplatform.user roles/cloudsql.client roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding elivision-ai-1 --member="serviceAccount:$SA" --role="$R"
done
# secretAccessor is granted per-secret; storage.objectAdmin on the bucket

# Artifact Registry
gcloud artifacts repositories create proposal-agent --repository-format=docker \
  --location=asia-southeast2
```

## Deploy

The container's `entrypoint.sh` runs `prisma migrate deploy` on start, so schema migrations
apply automatically.

```bash
# Cloud Build (remote — works without Docker locally)
gcloud builds submit --config=cloudbuild.yaml .

# or local Docker
bash scripts/deploy.sh
```

`cloudbuild.yaml` builds the image, pushes it to Artifact Registry and deploys the service.
Env vars, secrets, the service account and the Cloud SQL connection are set once on the
service and **preserved across image-only redeploys**.

## CI/CD — git push → auto deploy

Set up in the **Cloud Run console → `proposal-agent` → Continuous Deployment**: connect the
GitHub repo (one-time browser authorization of the Cloud Build app), branch `^main$`,
Dockerfile `/Dockerfile`. The wizard creates the Cloud Build trigger and grants the build
service account its IAM. Every push to `main` then rebuilds and redeploys.

## Operations

- **Cold start:** with `min-instances=0`, the first request after idle takes ~10–20 s.
  Set `min-instances=1` to eliminate it.
- **Background jobs:** a web review runs after the HTTP response returns. It completes
  while the review's progress page is polling; for guaranteed completion regardless of
  client behaviour, use `min-instances=1` or move the job to Cloud Tasks. MCP
  `review_proposal` runs inline and is unaffected.
- **Logs:** `gcloud run services logs read proposal-agent --region=asia-southeast2`.
- **Tracing:** per-review agent traces in Langfuse when the keys are configured.

## Local development

```bash
npm install
cp .env.example .env            # fill in values
docker compose up -d db         # or any local Postgres
npm run prisma:deploy           # apply migrations
npm run db:seed                 # seed the demo organization
npm run dev                     # http://localhost:3000
```
