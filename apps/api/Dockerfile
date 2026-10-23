# ZEITZEUGE API — multi-stage build for ECS Fargate.
#
# Stage one resolves dependencies with Poetry into a self-contained virtualenv;
# stage two copies that virtualenv next to the source and carries no Poetry, no
# compiler and no build cache. The result is a smaller image and a smaller
# attack surface — nothing in the running container can install a package.
#
# Build for linux/amd64 explicitly when building on an Apple-silicon machine:
# Fargate is x86, and an arm64 image fails at task start with an exec-format
# error that reads like a crash loop for no reason.

# --- build -----------------------------------------------------------------
FROM python:3.12-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Must match (or exceed) the Poetry that wrote poetry.lock: a lock file
    # from Poetry 2 is unreadable to Poetry 1.8, and the build fails with a
    # message about an incompatible lock file rather than anything useful.
    POETRY_VERSION=2.5.1 \
    POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=true

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/* \
 && pip install "poetry==${POETRY_VERSION}"

# The build directory is /app — the same path the runtime stage uses. A
# virtualenv bakes its own absolute path into every console script, so
# building in /build and copying to /app produces an image whose entrypoint
# fails with "no such file or directory" and no further explanation.
WORKDIR /app

# Dependencies first: this layer is cached across every source-only change,
# which is most of them during a hackathon.
COPY pyproject.toml poetry.lock* ./
RUN poetry install --only main --no-root

COPY src ./src
COPY migrations ./migrations
COPY alembic.ini ./
# The project itself is not installed into the virtualenv: the runtime stage
# puts `/app/src` on PYTHONPATH instead. Installing it would drag the packaging
# metadata (README, license files) into the image for no benefit, and would
# fail the build the moment one of them is left out of the build context.

# --- runtime ---------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH"

# curl for the container health check; nothing else is added.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 zeitzeuge

WORKDIR /app
COPY --from=builder --chown=zeitzeuge:zeitzeuge /app/.venv ./.venv
COPY --from=builder --chown=zeitzeuge:zeitzeuge /app/src ./src
COPY --from=builder --chown=zeitzeuge:zeitzeuge /app/migrations ./migrations
COPY --from=builder --chown=zeitzeuge:zeitzeuge /app/alembic.ini ./

ENV PYTHONPATH=/app/src
USER zeitzeuge
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:8000/healthz || exit 1

# One worker per task: scaling is ECS's job, and a single-process container is
# the one whose CPU and memory metrics mean what the autoscaler thinks.
# `--no-proxy-headers`: uvicorn would otherwise rewrite the client address from
# X-Forwarded-For, which the caller controls. The viewer's address comes from
# CloudFront-Viewer-Address instead (middleware/request_context.client_ip).
CMD ["uvicorn", "zeitzeuge_api.main:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--no-proxy-headers", \
     "--no-server-header", "--timeout-keep-alive", "65"]
