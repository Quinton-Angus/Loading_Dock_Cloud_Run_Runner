FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_USER_HOME=/root/.gradle \
    PATH=/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/build-tools/35.0.0:$PATH \
    NODE_OPTIONS=--max-old-space-size=1024 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    openjdk-17-jdk-headless \
    python3 \
    make \
    g++ \
    unzip \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Android command-line tools and the SDK components used by Expo/EAS Android builds.
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools \
    && wget -q https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip -O /tmp/android-tools.zip \
    && unzip -q /tmp/android-tools.zip -d ${ANDROID_HOME}/cmdline-tools \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm /tmp/android-tools.zip \
    && yes | sdkmanager --licenses >/dev/null || true \
    && sdkmanager \
       "platform-tools" \
       "platforms;android-35" \
       "build-tools;35.0.0" \
       "cmake;3.22.1" \
    && rm -rf /root/.cache

WORKDIR /runner

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
RUN npm install --global eas-cli@latest --no-audit --no-fund

COPY runner.js ./

RUN mkdir -p /workspace/source /workspace/output

ENTRYPOINT ["node", "/runner/runner.js"]
