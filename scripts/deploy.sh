#!/usr/bin/env bash
# Local Docker build → Cloud Run deploy (alternative to cloudbuild.yaml).
# Requires Docker Desktop running. Runtime env vars / secrets are configured
# once on the service (see README) — this script only ships a new image.
set -euo pipefail

PROJECT="${GCP_PROJECT:-elivision-ai-1}"
REGION="${REGION:-asia-southeast2}"
SERVICE="proposal-agent"
REPO="proposal-agent"
TAG="$(git rev-parse --short HEAD 2>/dev/null || date +%s)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${SERVICE}:${TAG}"

echo "Building ${IMAGE} ..."
docker build -f docker/Dockerfile -t "${IMAGE}" .

echo "Pushing image ..."
docker push "${IMAGE}"

echo "Deploying to Cloud Run ..."
gcloud run deploy "${SERVICE}" \
  --image="${IMAGE}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --no-cpu-throttling \
  --min-instances=0 \
  --max-instances=5 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=600

echo "Done. Service URL:"
gcloud run services describe "${SERVICE}" --region="${REGION}" --project="${PROJECT}" --format='value(status.url)'
