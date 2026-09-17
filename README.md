# Loading Dock Cloud Run Runner

A disposable Google Cloud Run Job runner for Loading Dock Android/EAS local builds.

## Runtime

The reference job is configured for:

- 4 vCPU
- 16 GiB RAM
- 1 task
- 1 task at a time
- 0 automatic retries
- 1 hour task timeout

Cloud Run Jobs support execution-time overrides for environment variables, so the repository URL and build directory can change for every build without changing the Job definition.

## Dynamic build inputs

These are supplied for each execution:

- `BUILD_REPO_URL` — Git repository URL to clone.
- `BUILD_DIRECTORY` — directory inside the cloned repository to build. Use `.` for the repository root.
- `BUILD_ID` — optional identifier used for runner logging. If omitted, the Cloud Run execution ID is used.

Example:

```bash
gcloud run jobs execute loading-dock-builder \
  --region=europe-west1 \
  --update-env-vars \
  "BUILD_REPO_URL=https://github.com/Quinton-Angus/Dev-Connect-Mobile-V2,BUILD_DIRECTORY=Dev-Connect-Mobile,BUILD_ID=dev-connect-v2"
```

The execution override does not change the underlying Job configuration.

## Constant Job configuration

The supplied `job.yaml` keeps build constants in Cloud Run environment variables:

```text
BUILD_PLATFORM=android
BUILD_PROFILE=preview
BUILD_OUTPUT_DIRECTORY=/workspace/output
BUILD_WORKSPACE_DIRECTORY=/workspace/source
GRADLE_HEAP_MB=6144
GRADLE_METASPACE_MB=1024
GRADLE_WORKERS=4
RUN_EXPO_DOCTOR=true
NPM_INSTALL_COMMAND=ci
```

Change these in the Cloud Run Job rather than rebuilding the image when possible.

## EAS authentication and artifact delivery

The runner performs the Android build locally inside Cloud Run, then uploads the resulting APK directly to EAS using:

```bash
eas upload --platform android --build-path <APK> --non-interactive --json
```

Expo documents `eas upload` as the command for uploading a local build and generating a shareable link. Local EAS builds require Expo authentication; this runner uses `EXPO_TOKEN`. citeturn1search0turn1search5

Create an Expo access token and store it in Google Secret Manager as `EXPO_TOKEN`. Do **not** put the token directly into `job.yaml` or an ordinary environment variable. Cloud Run can expose a Secret Manager secret as an environment variable, and the Job service account needs Secret Manager Secret Accessor permission. citeturn2search0turn2search1

For example:

```bash
gcloud run jobs update loading-dock-builder \
  --region=europe-west1 \
  --set-secrets EXPO_TOKEN=EXPO_TOKEN:1
```

The resulting flow is:

```text
Cloud Run Job starts
        ↓
shallow git clone
        ↓
npm ci / npm install
        ↓
Expo Doctor
        ↓
EAS local Android build
        ↓
APK
        ↓
eas upload
        ↓
EAS-hosted artifact / shareable URL
        ↓
exit 0
```

There is no Google Cloud Storage dependency for the build artifact.

## Build the image

Artifact Registry image URLs use this format:

```text
LOCATION-docker.pkg.dev/PROJECT_ID/REPOSITORY/IMAGE:TAG
```

For this runner, a sensible example is:

```text
europe-west1-docker.pkg.dev/PROJECT_ID/loading-dock/loading-dock-builder:latest
```

Google documents this Artifact Registry naming format and Cloud Run can deploy images from Artifact Registry directly. citeturn0search2turn0search0

Build and push it with:

```bash
gcloud builds submit \
  --tag=europe-west1-docker.pkg.dev/PROJECT_ID/loading-dock/loading-dock-builder:latest
```

Then replace `IMAGE_URL` in `job.yaml` with that image URL and deploy:

```bash
gcloud run jobs replace job.yaml --region=europe-west1
```

Alternatively:

```bash
gcloud run jobs create loading-dock-builder \
  --image=europe-west1-docker.pkg.dev/PROJECT_ID/loading-dock/loading-dock-builder:latest \
  --region=europe-west1 \
  --cpu=4 \
  --memory=16Gi \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=1h \
  --set-secrets EXPO_TOKEN=EXPO_TOKEN:1
```

Cloud Run's documented container image format is `LOCATION-docker.pkg.dev/PROJECT_ID/REPOSITORY/IMAGE:TAG`. citeturn0search0turn0search2

## Security

Do not put secrets such as Expo tokens or GitHub credentials directly into the image or ordinary plaintext Job configuration. Use Secret Manager for credentials. A private Git repository will also require an appropriate Git authentication mechanism.

The runner itself is intentionally stateless: one Job execution performs one build, uploads the artifact to EAS, and terminates.
