FROM node:24-trixie

ARG TZ
ENV TZ="$TZ"

# Basic dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
  less git procps sudo fzf zsh man-db unzip gnupg2 gh \
  jq nano vim curl wget ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Electron / electron-builder Linux build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
  dpkg fakeroot rpm libx11-dev libxkbfile-dev libsecret-1-dev \
  libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm1 libasound2t64 \
  python3 python3-pip \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install pnpm (skip corepack prompts)
ENV COREPACK_ENABLE_AUTO_PIN=0
RUN corepack enable && corepack prepare pnpm@latest --activate && \
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm --version

# Install rcodesign (Mozilla cross-platform Apple code signing)
ARG RCODESIGN_VERSION=0.27.0
RUN ARCH=$(dpkg --print-architecture) && \
  if [ "$ARCH" = "amd64" ]; then RUST_ARCH="x86_64"; else RUST_ARCH="aarch64"; fi && \
  wget -q "https://github.com/indygreg/apple-platform-rs/releases/download/apple-codesign%2F${RCODESIGN_VERSION}/apple-codesign-${RCODESIGN_VERSION}-${RUST_ARCH}-unknown-linux-musl.tar.gz" \
    -O /tmp/rcodesign.tar.gz && \
  tar xzf /tmp/rcodesign.tar.gz -C /tmp && \
  cp /tmp/apple-codesign-${RCODESIGN_VERSION}-${RUST_ARCH}-unknown-linux-musl/rcodesign /usr/local/bin/ && \
  chmod +x /usr/local/bin/rcodesign && \
  rm -rf /tmp/apple-codesign-* /tmp/rcodesign.tar.gz

# Locale
RUN apt-get update && \
  apt-get install -y locales && \
  echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen && \
  locale-gen en_US.UTF-8 && \
  update-locale LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 && \
  apt-get clean && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# git-delta
ARG GIT_DELTA_VERSION=0.18.2
RUN ARCH=$(dpkg --print-architecture) && \
  wget -q "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
  rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# sudo for node user
RUN echo "node ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/node

# Persist shell history
RUN mkdir /commandhistory && touch /commandhistory/.bash_history && chown -R node /commandhistory

ENV DEVCONTAINER=true

RUN mkdir -p /workspace /home/node/.claude && \
  chown -R node:node /workspace /home/node/.claude

WORKDIR /workspace

USER node

# zsh setup
ARG ZSH_IN_DOCKER_VERSION=1.2.1
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
  -a "source /usr/share/doc/fzf/examples/key-bindings.zsh" \
  -a "source /usr/share/doc/fzf/examples/completion.zsh" \
  -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
  -x \
  -t theunraveler

ENV SHELL=/bin/zsh
ENV EDITOR=nano
ENV VISUAL=nano

# Install Claude Code
RUN curl -fsSL https://claude.ai/install.sh | bash

USER node
