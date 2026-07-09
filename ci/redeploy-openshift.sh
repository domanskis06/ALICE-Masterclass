#!/bin/sh
set -eu

APP_NAME="${1:?usage: redeploy-openshift.sh <app-name>}"

oc import-image "$APP_NAME" --all \
  --server="$SERVER" --namespace="$NAMESPACE" --token="$IMAGE_IMPORT_TOKEN"

sleep 30s
oc rollout status "dc/$APP_NAME" \
  --server="$SERVER" --namespace="$NAMESPACE" --token="$IMAGE_IMPORT_TOKEN"
