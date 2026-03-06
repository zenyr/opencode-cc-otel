# @zenyr/opencode-cc-telemetry

OpenCode telemetry plugin project.

현재 저장소는 **foundation stage**입니다. 목표는 OpenCode plugin interface에 맞는 telemetry 수집/정규화/전송 구조를 안정적으로 제공하는 것입니다.

## What this is

- OpenCode plugin용 telemetry 패키지
- Bun + Turbo 기반 모노레포
- hexagonal architecture 기반 패키지 분리
- 배포 대상은 `opencode-cc-telemetry` (`packages/main`) 1개

## Current status

- plugin hook 보일러플레이트 구성 완료
- domain/application/adapters/main 패키지 경계 분리 완료
- core scaffold 기준 빌드/테스트 통과

## Notable Reference

- https://github.com/pai4451/opencode-telemetry-plugin

## Spec refs in this repo

- `refs/claude-reverse/metrics-to-anthropic.md`
- `refs/claude-reverse/docs/claude/telemetry-event-names.txt`
- `refs/README.md`
