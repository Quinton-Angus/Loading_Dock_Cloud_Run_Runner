FROM ubuntu:24.04

ARG NODE_VERSION=20.19.4

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV ANDROID_NDK_VERSION=27.1.12297006
ENV ANDROID_NDK_HOME=/opt/android-sdk/ndk/27.1.12297006
ENV ANDROID_NDK_ROOT=/opt/android-sdk/ndk/27.1.12297006
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH=/usr/local/bin:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/emulator:/opt/android-sdk/cmake/3.22.1/bin:$PATH
ENV NODE_OPTIONS=--max-old-space-size=512

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    git \
    wget \
    unzip \
    zip \
    build-essential \
    cmake \
    ninja-build \
    python3 \
    python3-pip \
    openjdk-17-jdk \
    file \
    && rm -rf /var/lib/apt/lists/*

# Match the Node.js version used by the Expo SDK 54 EAS Android image.
RUN curl -fsSL https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz \
    | tar -xJ --strip-components=1 -C /usr/local

RUN node --version && npm --version && java -version && cmake --version && ninja --version

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools

RUN wget -q https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip \
    -O /tmp/cmdline-tools.zip \
    && unzip -q /tmp/cmdline-tools.zip -d ${ANDROID_HOME}/cmdline-tools \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm /tmp/cmdline-tools.zip

RUN yes | sdkmanager --licenses > /dev/null || true

# Match the core Android toolchain used by the Expo SDK 54 EAS image.
RUN sdkmanager \
    "platform-tools" \
    "platforms;android-35" \
    "build-tools;35.0.0" \
    "ndk;27.1.12297006" \
    "cmake;3.22.1"

WORKDIR /runner

COPY package*.json ./
RUN npm install --omit=dev
RUN npm i -g eas-cli@latest

COPY . .

RUN mkdir -p /builds/output /build

COPY start.sh /runner/start.sh
RUN chmod +x /runner/start.sh

ENTRYPOINT ["/runner/start.sh"]
