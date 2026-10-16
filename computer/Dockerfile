FROM docker.io/cloudflare/sandbox:1.0.0 AS sandbox-tools
FROM docker.io/library/node:22-alpine
RUN apk add --no-cache bash git curl jq ripgrep python3 chromium font-noto coreutils
COPY --from=sandbox-tools /usr/local/bin/sandbox-shim /usr/local/bin/sandbox-shim
ENV HOME=/root GIT_AUTHOR_NAME=hark GIT_AUTHOR_EMAIL=hark@users.noreply.github.com GIT_COMMITTER_NAME=hark GIT_COMMITTER_EMAIL=hark@users.noreply.github.com
WORKDIR /workspace
CMD ["sleep", "infinity"]
