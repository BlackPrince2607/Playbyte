# ADR 0001 — Python FastAPI instead of NestJS

- **Status:** Accepted
- **Date:** 2026-08-28

## Context

Architecture v1.2 specifies NestJS + TypeScript for the modular monolith. The product owner requested a Python backend.

## Decision

Implement the API and worker in **Python 3.12 + FastAPI + Pydantic v2 + SQLAlchemy 2.0 async**. Preserve Architecture module boundaries, `/v1` contracts, Postgres-as-source-of-truth, outbox, and `RealtimePublisher` interface.

## Consequences

- OpenAPI from FastAPI is the contract source; TypeScript clients consume generated/hand-maintained types in `packages/api-client`.
- Operational tooling (Sentry, structured logs) uses Python SDKs.
- NestJS-specific libraries (pg-boss, Fastify) are replaced with a Postgres outbox poller.

## Alternatives considered

Django / Flask — FastAPI is the closest analog to NestJS modules, typed DTOs, and OpenAPI.
