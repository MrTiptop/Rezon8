FROM debian:bookworm-slim AS runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG LIBRESPOT_VERSION=unknown
ARG SHAIRPORT_SYNC_VERSION=unknown

LABEL org.rezon8.stream_source.librespot="${LIBRESPOT_VERSION}" \
      org.rezon8.stream_source.shairport_sync="${SHAIRPORT_SYNC_VERSION}"

RUN rm -rf /var/lib/apt/lists/* && apt-get -o Acquire::Retries=5 -o Acquire::AllowInsecureRepositories=true -o Acquire::AllowDowngradeToInsecureRepositories=true update && apt-get install -y --allow-unauthenticated --fix-missing --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    jq \
    snapclient \
    snapserver \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY docker/snapcast-test/snapserver.conf /etc/snapserver.conf
COPY docker/snapcast-test/snapweb/ /usr/share/snapserver/snapweb/
COPY docker/snapcast-test/start.sh /start.sh

RUN chmod +x /start.sh

EXPOSE 1704 1705 1780

ENTRYPOINT ["/usr/bin/tini", "--", "/start.sh"]
