export const MEMORY_CONFIG = Object.freeze({
  containerLimitMB: 16384,
  safetyMarginMB: 4096,
  nodeHeapMB: 512,
  gradleHeapMB: 4096,
  gradleMetaspaceMB: 1024
})

export const NODE_OPTIONS = `--max-old-space-size=${MEMORY_CONFIG.nodeHeapMB}`

export function validateJavaHeapSize(value) {
  const normalized = String(value).trim().toLowerCase()
  const match = normalized.match(/^(\\d+(?:\\.\\d+)?)(m|g)$/)
  if (!match || Number(match[1]) <= 0) throw new Error(`Invalid Java heap size: ${value}`)
  return normalized
}

export function resolveGradleHeapMB(requestedMemory) {
  if (!requestedMemory) return MEMORY_CONFIG.gradleHeapMB
  const match = String(requestedMemory).trim().toLowerCase().match(/^(\\d+(?:\\.\\d+)?)(m|g)$/)
  if (!match) return MEMORY_CONFIG.gradleHeapMB
  return Math.floor(Number(match[1]) * (match[2] === "g" ? 1024 : 1))
}

export function createGradleJvmArgs(requestedMemory) {
  const gradleHeapMB = resolveGradleHeapMB(requestedMemory)
  return [
    `-Xmx${gradleHeapMB}m`,
    `-XX:MaxMetaspaceSize=${MEMORY_CONFIG.gradleMetaspaceMB}m`,
    "-XX:+HeapDumpOnOutOfMemoryError",
    "-Dfile.encoding=UTF-8"
  ]
}

export function createGradleJvmArgsProperty(requestedMemory) {
  return createGradleJvmArgs(requestedMemory).join(" ")
}

export function createGradleEnvironment(requestedMemory, baseEnvironment = process.env) {
  return {
    ...baseEnvironment,
    GRADLE_OPTS: `-Dorg.gradle.jvmargs=\"${createGradleJvmArgsProperty(requestedMemory)}\" -Dorg.gradle.parallel=true -Dorg.gradle.daemon=false`
  }
}
