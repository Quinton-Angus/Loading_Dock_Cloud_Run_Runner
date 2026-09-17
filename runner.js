import { spawn } from "node:child_process"
import { mkdir, rm, access } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { basename, join, resolve } from "node:path"

const config = {
  repoUrl: process.env.BUILD_REPO_URL,
  buildDirectory: process.env.BUILD_DIRECTORY || ".",
  platform: process.env.BUILD_PLATFORM || "android",
  profile: process.env.BUILD_PROFILE || "preview",
  outputDirectory: process.env.BUILD_OUTPUT_DIRECTORY || "/workspace/output",
  workspaceDirectory: process.env.BUILD_WORKSPACE_DIRECTORY || "/workspace/source",
  gradleHeapMB: process.env.GRADLE_HEAP_MB || "6144",
  gradleMetaspaceMB: process.env.GRADLE_METASPACE_MB || "1024",
  gradleWorkers: process.env.GRADLE_WORKERS || "4",
  runExpoDoctor: process.env.RUN_EXPO_DOCTOR !== "false",
  npmInstallCommand: process.env.NPM_INSTALL_COMMAND || "ci",
  buildId: process.env.BUILD_ID || process.env.CLOUD_RUN_EXECUTION || "build"
}

function log(message) {
  console.log(`[RUNNER] ${message}`)
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    log(`Running: ${command} ${args.join(" ")}`)

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"]
    })

    child.stdout.on("data", data => process.stdout.write(data))
    child.stderr.on("data", data => process.stderr.write(data))
    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

function runCapture(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    log(`Running: ${command} ${args.join(" ")}`)

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"]
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", data => {
      const text = data.toString()
      stdout += text
      process.stdout.write(text)
    })

    child.stderr.on("data", data => {
      const text = data.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on("error", reject)
    child.on("close", code => {
      if (code === 0) resolvePromise({ stdout, stderr })
      else reject(new Error(`${command} exited with code ${code}`))
    })
  })
}

function validateConfig() {
  if (!config.repoUrl) throw new Error("BUILD_REPO_URL is required")

  if (!/^https?:\/\//i.test(config.repoUrl) && !/^git@/i.test(config.repoUrl)) {
    throw new Error("BUILD_REPO_URL must be an HTTP(S) or SSH Git URL")
  }

  if (!/^[0-9]+$/.test(String(config.gradleHeapMB)) || Number(config.gradleHeapMB) < 512) {
    throw new Error("GRADLE_HEAP_MB must be an integer of at least 512 MB")
  }

  if (!/^[0-9]+$/.test(String(config.gradleMetaspaceMB)) || Number(config.gradleMetaspaceMB) < 128) {
    throw new Error("GRADLE_METASPACE_MB must be an integer of at least 128 MB")
  }

  if (!/^[1-9][0-9]*$/.test(String(config.gradleWorkers))) {
    throw new Error("GRADLE_WORKERS must be a positive integer")
  }

  if (!/^[a-z0-9._-]+$/i.test(config.buildId)) {
    throw new Error("BUILD_ID contains unsupported characters")
  }

  if (!process.env.EXPO_TOKEN) {
    throw new Error("EXPO_TOKEN is required for EAS authentication")
  }
}

async function installDependencies(buildDirectory) {
  const hasLockFile = await Promise.any([
    access(join(buildDirectory, "package-lock.json"), fsConstants.F_OK),
    access(join(buildDirectory, "npm-shrinkwrap.json"), fsConstants.F_OK)
  ]).then(() => true).catch(() => false)

  const npmCommand = hasLockFile && config.npmInstallCommand === "ci" ? "ci" : "install"

  await run("npm", [npmCommand, "--prefer-offline", "--no-audit", "--no-fund"], {
    cwd: buildDirectory
  })
}

function createGradleEnvironment() {
  const jvmArgs = [
    `-Xmx${config.gradleHeapMB}m`,
    `-XX:MaxMetaspaceSize=${config.gradleMetaspaceMB}m`,
    "-XX:+UseG1GC",
    "-Dfile.encoding=UTF-8"
  ].join(" ")

  return {
    ...process.env,
    GRADLE_OPTS: [
      `-Dorg.gradle.jvmargs=\"${jvmArgs}\"`,
      `-Dorg.gradle.workers.max=${config.gradleWorkers}`,
      "-Dorg.gradle.parallel=true",
      "-Dorg.gradle.daemon=false"
    ].join(" ")
  }
}

function getRepositoryName(repoUrl) {
  const cleaned = repoUrl.replace(/\.git$/i, "").replace(/\/$/, "")
  return basename(cleaned) || "repository"
}

async function uploadToEas(buildPath) {
  const result = await runCapture(
    "eas",
    [
      "upload",
      "--platform", config.platform,
      "--build-path", buildPath,
      "--non-interactive",
      "--json"
    ],
    { cwd: resolve(config.workspaceDirectory, config.buildDirectory) }
  )

  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    log("EAS upload completed, but its JSON response could not be parsed.")
    return null
  }

  const url = parsed?.build?.artifacts?.buildUrl
    || parsed?.build?.artifacts?.applicationArchiveUrl
    || parsed?.buildUrl
    || parsed?.url
    || null

  if (url) log(`EAS artifact URL: ${url}`)
  else log("EAS upload completed successfully.")

  return { url, response: parsed }
}

async function main() {
  validateConfig()

  log(`Cloud Run job: ${process.env.CLOUD_RUN_JOB || "local"}`)
  log(`Execution: ${process.env.CLOUD_RUN_EXECUTION || "local"}`)
  log(`Repository: ${config.repoUrl}`)
  log(`Build directory: ${config.buildDirectory}`)
  log(`Gradle heap: ${config.gradleHeapMB} MB`)
  log(`Gradle metaspace: ${config.gradleMetaspaceMB} MB`)
  log(`Gradle workers: ${config.gradleWorkers}`)

  await rm(config.workspaceDirectory, { recursive: true, force: true })
  await mkdir(config.workspaceDirectory, { recursive: true })
  await mkdir(config.outputDirectory, { recursive: true })

  await run("git", [
    "clone",
    "--depth", "1",
    "--single-branch",
    config.repoUrl,
    config.workspaceDirectory
  ])

  const buildDirectory = resolve(config.workspaceDirectory, config.buildDirectory)
  const workspaceRoot = resolve(config.workspaceDirectory)

  if (!buildDirectory.startsWith(`${workspaceRoot}/`) && buildDirectory !== workspaceRoot) {
    throw new Error("BUILD_DIRECTORY must stay inside the cloned repository")
  }

  await access(buildDirectory, fsConstants.F_OK)
  log(`Build working directory: ${buildDirectory}`)

  await installDependencies(buildDirectory)

  if (config.runExpoDoctor) {
    await run("npx", ["expo-doctor"], { cwd: buildDirectory })
  }

  const repositoryName = getRepositoryName(config.repoUrl)
  const outputFile = join(
    config.outputDirectory,
    `${repositoryName}-${config.buildId}.apk`
  )

  await run(
    "eas",
    [
      "build",
      "--platform", config.platform,
      "--profile", config.profile,
      "--local",
      "--non-interactive",
      "--output", outputFile
    ],
    {
      cwd: buildDirectory,
      env: createGradleEnvironment()
    }
  )

  await access(outputFile, fsConstants.F_OK)
  log(`Local build completed: ${outputFile}`)

  await uploadToEas(outputFile)
  log(`Build ${config.buildId} uploaded to EAS successfully.`)
}

main().catch(error => {
  console.error(`[RUNNER] Build runner failed: ${error.message}`)
  console.error(error)
  process.exitCode = 1
})
