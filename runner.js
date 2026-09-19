import { spawn } from "node:child_process"
import { mkdir, rm, access } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import { basename, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { createGradleEnvironment, validateJavaHeapSize } from "./memoryConfig.js"

const config = {
  repoUrl: process.env.BUILD_REPO_URL,
  buildDirectory: process.env.BUILD_DIRECTORY || ".",
  outputDirectory: process.env.BUILD_OUTPUT_DIRECTORY || "/builds/output",
  workspaceDirectory: process.env.BUILD_WORKSPACE_DIRECTORY || "/build",
  maxRAMusage: process.env.BUILD_MAX_RAM_USAGE || "4g",
  runExpoDoctor: process.env.RUN_EXPO_DOCTOR !== "false",
  buildId: process.env.BUILD_ID || process.env.CLOUD_RUN_EXECUTION || "build"
}

function log(message) {
  console.log(`[LOG] ${message}`)
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
    child.on("close", code => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with code ${code}`)))
  })
}

function validateConfig() {
  if (!config.repoUrl) throw new Error("BUILD_REPO_URL is required")
  if (!/^https?:\/\//i.test(config.repoUrl) && !/^git@/i.test(config.repoUrl)) {
    throw new Error("BUILD_REPO_URL must be an HTTP(S) or SSH Git URL")
  }
  config.maxRAMusage = validateJavaHeapSize(config.maxRAMusage)
}

function getRepositoryName(repoUrl) {
  const cleaned = repoUrl.replace(/\.git$/i, "").replace(/\/$/, "")
  return basename(cleaned) || "repository"
}

async function installDependencies(buildDirectory) {
  log("Installing npm packages")
  await run("npm", ["i"], { cwd: buildDirectory })
}

async function main() {
  validateConfig()
  log("Build command received. processing request, please wait...")
  log(`Requested build url is ${config.repoUrl}`)
  log(`Build directory set as: "${config.buildDirectory}"`)
  log(`Requested maximum Java heap size is: ${config.maxRAMusage}`)

  await rm(config.workspaceDirectory, { recursive: true, force: true })
  await mkdir(config.workspaceDirectory, { recursive: true })
  await mkdir(config.outputDirectory, { recursive: true })

  log(`Cloning "${config.repoUrl}" into build directory`)
  await run("git", ["clone", config.repoUrl, config.workspaceDirectory])

  const workspaceRoot = resolve(config.workspaceDirectory)
  const workingDirectory = resolve(workspaceRoot, config.buildDirectory)
  if (!workingDirectory.startsWith(`${workspaceRoot}/`) && workingDirectory !== workspaceRoot) {
    throw new Error("BUILD_DIRECTORY must stay inside the cloned repository")
  }

  await access(workingDirectory, fsConstants.F_OK)
  log(`Using generated working build directory: "${workingDirectory}"`)

  await installDependencies(workingDirectory)
  if (config.runExpoDoctor) await run("npx", ["expo-doctor"], { cwd: workingDirectory })

  log("Build check passed.")
  log(`Using maximum Java heap size from build request: ${config.maxRAMusage}`)

  const repositoryName = getRepositoryName(config.repoUrl)
  const outputFile = join(config.outputDirectory, `loadingDockOutput.${repositoryName}.${config.buildId}.apk`)

  log("Beginning EAS build")
  await run("eas", [
    "build", "--platform", "android", "--profile", "preview", "--local", "--output", outputFile
  ], {
    cwd: workingDirectory,
    env: createGradleEnvironment(config.maxRAMusage)
  })

  await access(outputFile, fsConstants.F_OK)
  log(`Build request successful, file created at: "${outputFile}". Build successful.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`[ERROR] Build runner failed: ${error.message}`)
    console.error(error)
    process.exitCode = 1
  })
}
