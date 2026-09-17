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
- `BUILD_ID` — optional identifier used in the APK filename and artifact path. If omitted, the Cloud Run execution ID is used.

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
ARTIFACT_PREFIX=loading-dock
```

Change these in the Cloud Run Job rather than rebuilding the image when possible.

## Artifact delivery

Set `ARTIFACT_BUCKET` on the Cloud Run Job to automatically upload the completed APK using the Job's service account credentials:

```text
ARTIFACT_BUCKET=your-loading-dock-artifacts-bucket
```

Artifacts are stored as:

```text
gs://BUCKET/loading-dock/BUILD_ID/REPOSITORY.apk
```

The container does not use `GOOGLE_APPLICATION_CREDENTIALS`; Cloud Run service identity/Application Default Credentials are used instead.

If `ARTIFACT_BUCKET` is not configured, the APK remains in `/workspace/output` until the task exits.

## Build pipeline

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
APK written to /workspace/output
        ↓
optional Cloud Storage upload
        ↓
exit 0
```

The job does not run an HTTP server. It is intended to start, perform one build, deliver the artifact, and terminate.

## Build the image

Push the image to Artifact Registry, then replace `IMAGE_URL` in `job.yaml` with the resulting image URL.

Example:

```bash
gcloud builds submit \
  --tag=europe-west1-docker.pkg.dev/PROJECT_ID/loading-dock/loading-dock-builder:latest
```

Deploy the Job:

```bash
gcloud run jobs replace job.yaml --region=europe-west1
```

Or configure the same resources directly:

```bash
gcloud run jobs create loading-dock-builder \
  --image=europe-west1-docker.pkg.dev/PROJECT_ID/loading-dock/loading-dock-builder:latest \
  --region=europe-west1 \
  --cpu=4 \
  --memory=16Gi \
  --tasks=1 \
  --parallelism=1 \
  --max-retries=0 \
  --task-timeout=1h
```

## Security

Do not put secrets such as GitHub tokens or other credentials into ordinary environment variables. Use Cloud Run/Secret Manager integration for secrets. A private Git repository will require the runner to have an appropriate authentication mechanism; the current runner is intentionally built around public/authenticated Git URLs supplied to the job.
