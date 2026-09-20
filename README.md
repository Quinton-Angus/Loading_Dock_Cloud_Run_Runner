# Loading Dock Cloud Run Runner

A disposable Google Cloud Run Job runner for Loading Dock / Build Dock local EAS builds.

## Runtime

The reference Cloud Run Job is configured for:

- Region: `europe-north1`
- 4 vCPU
- 16 GiB RAM
- 1 task
- 1 task at a time
- 0 automatic retries
- 1 hour task timeout
- 10 GiB Cloud Run ephemeral disk

The build workspace, Gradle cache, npm cache, and APK output are mounted on the same ephemeral disk.

`/tmp` is intentionally **not** mounted onto the disk volume. It remains on the container's default temporary filesystem and therefore uses RAM.

The disk is deleted when the Cloud Run task ends. It is intended only for build-time data.

## Environment configuration

The Job keeps these values as environment variables:

```text
BUILD_PLATFORM=android
BUILD_PROFILE=preview
BUILD_OUTPUT_DIRECTORY=/builds/output
BUILD_WORKSPACE_DIRECTORY=/build
BUILD_MAX_RAM_USAGE=4g
RUN_EXPO_DOCTOR=true
NPM_CONFIG_CACHE=/root/.npm
TMPDIR=/tmp
```

`EXPO_TOKEN` is also required for the non-interactive EAS preflight/build, but it must not be committed to this public repository. Set it directly on the Cloud Run Job or provide it as an execution-time environment variable.

## Dynamic build inputs

These are supplied for each execution:

- `BUILD_REPO_URL` — Git repository URL to clone.
- `BUILD_DIRECTORY` — directory inside the cloned repository to build. Use `.` for the repository root.
- `BUILD_ID` — identifier used in the generated APK filename. If omitted, the Cloud Run execution ID is used.

The runner also reads `BUILD_PLATFORM` and `BUILD_PROFILE`, so the Job configuration controls the actual EAS build command.

## Build flow

Each execution:

1. Creates a clean build workspace.
2. Clones the requested Git repository.
3. Installs npm dependencies.
4. Runs Expo Doctor when enabled.
5. Runs EAS authentication/project preflight.
6. Runs an EAS local build.
7. Writes the resulting APK to `/builds/output`.
8. Exits and allows Cloud Run to discard the ephemeral disk.

The runner does **not** currently upload the APK to EAS after the local build.

## Build the container

Set the Google Cloud project:

```bash
gcloud config set project main-api-server
```

Create the Artifact Registry repository once if it does not already exist:

```bash
gcloud artifacts repositories create build-dock \
  --repository-format=docker \
  --location=europe-north1 \
  --description="Build Dock container images"
```

Build and push the image:

```bash
gcloud builds submit \
  --tag=europe-north1-docker.pkg.dev/main-api-server/build-dock/build-dock-runner:latest
```

## Deploy the Cloud Run Job

The repository contains the complete Job definition in `job.yaml`.

```bash
gcloud run jobs replace job.yaml \
  --region=europe-north1 \
  --project=main-api-server
```

The Job uses a Cloud Run ephemeral disk volume with `medium: Disk`. It is mounted at:

```text
/build
/builds
/root/.gradle
/root/.npm
```

`/tmp` is deliberately not mounted to that disk because it is intended to remain RAM-backed.

## Configure the EAS token

Do not put the real token into `job.yaml`, Dockerfile, or this repository.

Configure it directly on the Cloud Run Job:

```bash
gcloud run jobs update loading-dock-builder \
  --region=europe-north1 \
  --update-env-vars="EXPO_TOKEN=YOUR_EXPO_TOKEN"
```

Alternatively, supply it at execution time:

```bash
gcloud run jobs execute loading-dock-builder \
  --region=europe-north1 \
  --update-env-vars="EXPO_TOKEN=YOUR_EXPO_TOKEN,BUILD_REPO_URL=https://github.com/OWNER/REPOSITORY,BUILD_DIRECTORY=.,BUILD_ID=test-001" \
  --wait
```

## Execute a build

For example:

```bash
gcloud run jobs execute loading-dock-builder \
  --region=europe-north1 \
  --update-env-vars="BUILD_REPO_URL=https://github.com/Quinton-Angus/Dev-Connect-Mobile-V2,BUILD_DIRECTORY=.,BUILD_ID=dev-connect-v2" \
  --wait
```

If `EXPO_TOKEN` is already configured on the Job, it does not need to be included in the execution override.

## View executions and logs

List recent executions:

```bash
gcloud run jobs executions list \
  --job=loading-dock-builder \
  --region=europe-north1
```

Read logs:

```bash
gcloud logging read \
  'resource.type="cloud_run_job" AND resource.labels.job_name="loading-dock-builder"' \
  --project=main-api-server \
  --limit=100 \
  --format="value(textPayload)"
```

## Storage layout

The disk-backed paths are:

```text
/build
/builds
/root/.gradle
/root/.npm
```

The RAM-backed temporary path is:

```text
/tmp
```

The 10 GiB disk is disposable and is deleted when the task finishes. Build artifacts therefore need to be copied or returned by another system if they need to survive the execution.

## Security

The runner is intentionally stateless. No Tailscale configuration is required.

Do not commit Expo tokens, Git credentials, or other secrets to this public repository. A private build repository will require an appropriate Git authentication mechanism.
