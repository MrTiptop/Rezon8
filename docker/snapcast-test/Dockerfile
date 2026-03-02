# Robbie De Wet
FROM debian:bookworm-slim AS runtime

ARG DEBIAN_FRONTEND=noninteractive

RUN rm -rf /var/lib/apt/lists/* && apt-get -o Acquire::Retries=5 update && apt-get install -y --fix-missing --no-install-recommends \
    ca-certificates \
    curl \
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
