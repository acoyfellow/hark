FROM docker.io/cloudflare/sandbox:1.0.0 AS sandbox-tools
FROM docker.io/library/node:22-alpine
ARG APK_PLAIN_HTTP=0
ARG TRUST_LOCAL_CERTS=0
RUN if [ "$APK_PLAIN_HTTP" = 1 ]; then sed -i 's/https/http/' /etc/apk/repositories; fi && apk add --no-cache bash git curl jq ripgrep python3 coreutils ca-certificates
RUN npm install -g wrangler@4 >/dev/null 2>&1 || true
COPY certs/ /tmp/certs/
RUN if [ "$TRUST_LOCAL_CERTS" = 1 ]; then cat /tmp/certs/*.pem >> /etc/ssl/certs/ca-certificates.crt 2>/dev/null; fi; rm -rf /tmp/certs
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt
COPY --from=sandbox-tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
ENV HOME=/root GIT_AUTHOR_NAME=hark GIT_AUTHOR_EMAIL=hark@users.noreply.github.com GIT_COMMITTER_NAME=hark GIT_COMMITTER_EMAIL=hark@users.noreply.github.com
WORKDIR /workspace
CMD ["sleep", "infinity"]
