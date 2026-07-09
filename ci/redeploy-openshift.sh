#!/bin/sh
set -eu

APP_NAME="${1:?usage: redeploy-openshift.sh <app-name>}"
OC_OPTS="--server=${SERVER:?SERVER is required} --namespace=${NAMESPACE:?NAMESPACE is required} --token=${IMAGE_IMPORT_TOKEN:?IMAGE_IMPORT_TOKEN is required}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-10m}"

echo "Importing ImageStream ${APP_NAME}:latest ..."
oc import-image "${APP_NAME}:latest" --confirm ${OC_OPTS}

# ImageChange triggers are asynchronous; wait until the DC observes the new
# image and starts a rollout, then block on rollout status (no fixed sleep).
echo "Waiting for DeploymentConfig ${APP_NAME} rollout (timeout=${ROLLOUT_TIMEOUT}) ..."
if ! oc rollout status "dc/${APP_NAME}" ${OC_OPTS} --timeout="${ROLLOUT_TIMEOUT}"; then
  echo "Automatic ImageChange rollout did not finish; triggering explicit rollout ..."
  oc rollout latest "dc/${APP_NAME}" ${OC_OPTS}
  oc rollout status "dc/${APP_NAME}" ${OC_OPTS} --timeout="${ROLLOUT_TIMEOUT}"
fi

echo "Redeploy of ${APP_NAME} completed."
