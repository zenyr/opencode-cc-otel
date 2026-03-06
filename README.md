# @zenyr/opencode-cc-telemetry

Bun + Turbo 기반 모노레포입니다.

- 루트 패키지: `@zenyr/opencode-cc-telemetry` (private)
- 메인 배포 패키지: `packages/main` (`opencode-cc-telemetry`)
- hexagonal 아키텍처를 패키지 경계로 분리

## Package Layout

- `packages/domain` - 도메인 이벤트 모델
- `packages/application` - 유즈케이스/포트
- `packages/adapters` - 포트 구현체(예: sink, language resolver)
- `packages/main` - 최종 조립 및 외부 진입점

## Install

```bash
bun install
```

## Build

```bash
bun run build
```

모든 빌드는 `bun build`만 사용하며, 실행 오케스트레이션은 Turbo(`turbo run build`)를 사용합니다.

## Test

```bash
bun run test
```

## 참고

`pai4451/opencode-telemetry-plugin`의 목적과 구성 아이디어를 참고했지만, 구현은 현재 저장소에서 ground-up으로 새로 작성했습니다.
