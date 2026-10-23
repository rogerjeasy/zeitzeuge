# `compute-api`

The request path behind CloudFront.

```
CloudFront ─VPC Origin─▶ internal ALB ─┬─ /api/*  ─▶ api  (FastAPI :8000, x86_64, 1 vCPU / 2 GB)
                                       └─ /*      ─▶ web  (Next.js :3000, arm64, 0.5 vCPU / 1 GB)
```

## Resources

- ECS cluster (Container Insights on, Fargate + Fargate Spot providers)
- internal ALB (no public address; 300 s idle timeout for run-stream WebSockets;
  access logs to the access-logs bucket; invalid headers dropped)
- `api` and `web` services: circuit breaker **with rollback**, 100/200 %
  deployments, private subnets, no public IPs, autoscaling on ALB requests per
  target and on CPU
- `api-migrate` task definition: same image, owner credential, `alembic upgrade
  head`; CI runs it and **waits for exit code 0** before rolling the service
- read-only root filesystem on the API and migrate containers (`/tmp` only)

## Why no API Gateway

The API validates Cognito JWTs and serves WebSockets itself. A gateway in front
would add a hop, a per-request bill, and a second place for auth rules to drift.

## Switches

`api_image_ready` / `web_image_ready` keep each service at 0 tasks until CI has
pushed its first image. `api_min_tasks = 2` for the event (one per AZ).
