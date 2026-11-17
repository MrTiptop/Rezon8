# MrTiptop
# Rezon8 Snapweb test image with snapserver + pinned stream-source binaries.
#
# Build (from repo root):
#   LIBRESPOT_VERSION=$(python3 -c "import json;print(json.load(open('docker/snapcast-test/stream-sources.versions.json'))['librespot'])")
#   SHAIRPORT_SYNC_VERSION=$(python3 -c "import json;print(json.load(open('docker/snapcast-test/stream-sources.versions.json'))['shairport-sync'])")
#   docker build -f docker/snapcast-test/Dockerfile \
#     --build-arg LIBRESPOT_VERSION=$LIBRESPOT_VERSION \
#     --build-arg SHAIRPORT_SYNC_VERSION=$SHAIRPORT_SYNC_VERSION \
#     -t rezon8-snapserver .

ARG LIBRESPOT_VERSION=v0.8.0
ARG SHAIRPORT_SYNC_VERSION=5.6.3

# --- librespot (Rust) ---
FROM rust:1-bookworm AS librespot-build
ARG LIBRESPOT_VERSION
RUN cargo install --locked \
      --root /out \
      --git https://github.com/librespot-org/librespot \
      --tag "${LIBRESPOT_VERSION}" \
      --bins

# --- shairport-sync (stdout backend for Snapcast) ---
FROM debian:bookworm AS shairport-build
ARG SHAIRPORT_SYNC_VERSION
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      git \
      autoconf \
      automake \
      libtool \
      pkg-config \
      libpopt-dev \
      libconfig-dev \
      libssl-dev \
      libsoxr-dev \
      libavahi-client-dev \
      && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone --depth 1 --branch "${SHAIRPORT_SYNC_VERSION}" \
      https://github.com/mikebrady/shairport-sync.git .
RUN autoreconf -fi \
 && ./configure \
      --prefix=/usr/local \
      --sysconfdir=/etc \
      --with-stdout \
      --with-pipe \
      --with-avahi \
      --with-ssl=openssl \
      --with-metadata \
      --with-soxr \
      --without-configfiles \
 && make -j"$(nproc)" \
 && make install DESTDIR=/out

# --- runtime ---
FROM debian:bookworm-slim AS runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG LIBRESPOT_VERSION
ARG SHAIRPORT_SYNC_VERSION

LABEL org.rezon8.stream_source.librespot="${LIBRESPOT_VERSION}" \
      org.rezon8.stream_source.shairport_sync="${SHAIRPORT_SYNC_VERSION}"

RUN apt-get -o Acquire::Retries=5 update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      ffmpeg \
      jq \
      libasound2 \
      libavahi-client3 \
      libconfig9 \
      libpopt0 \
      libsoxr0 \
      libssl3 \
      snapclient \
      snapserver \
      tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=librespot-build /out/bin/librespot /usr/local/bin/librespot
COPY --from=shairport-build /out/usr/local/bin/shairport-sync /usr/local/bin/shairport-sync

WORKDIR /app

COPY docker/snapcast-test/snapserver.conf /etc/snapserver.conf
COPY docker/snapcast-test/snapweb/ /usr/share/snapserver/snapweb/
COPY docker/snapcast-test/start.sh /start.sh

RUN chmod +x /start.sh /usr/local/bin/librespot /usr/local/bin/shairport-sync \
 && librespot --version \
 && shairport-sync -V

EXPOSE 1704 1705 1780

ENTRYPOINT ["/usr/bin/tini", "--", "/start.sh"]
