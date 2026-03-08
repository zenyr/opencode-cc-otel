import {
  Alert,
  Button,
  Card,
  Code,
  Grid,
  Group,
  List,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { CodeCard } from "../components/CodeCard";
import { FeatureGrid } from "../components/FeatureGrid";
import { renderInlineCode } from "../components/InlineCode";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { StepList } from "../components/StepList";
import {
  heroActions,
  heroSignals,
  overviewLimits,
  overviewSupportHighlights,
  overviewValueProps,
  quickStartExample,
  quickStartSteps,
  supportSnapshot,
} from "../content";
import type { PageMeta } from "../content";

const OverviewPage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page} showIntro={false}>
      <Card className="hero-card" padding="xl" radius="xl" withBorder>
        <Stack gap="xl">
          <Grid align="center" gutter="xl">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Stack gap="md">
                <Text className="page-eyebrow">{page.label}</Text>
                <Title className="hero-title" order={2}>
                  Claude-compatible telemetry for OpenCode.
                </Title>
                <Text c="dimmed" size="lg">
                  <Code>opencode-cc-otel</Code> is an OpenCode plugin for
                  Claude-compatible telemetry. Add one plugin entry, add{" "}
                  <Code>telemetry.jsonc</Code>, then start with 2P console or
                  OTEL JSON. Turn on 1P only if you need Anthropic-side
                  reporting.
                </Text>
                <Group gap="sm">
                  {heroActions.map((action) => (
                    <Button
                      component="a"
                      href={action.href}
                      key={action.label}
                      variant={
                        action.label === "Quickstart" ? "filled" : "light"
                      }
                    >
                      {action.label}
                    </Button>
                  ))}
                </Group>
              </Stack>
            </Grid.Col>
            <Grid.Col span={{ base: 12, lg: 5 }}>
              <Stack className="hero-signals" gap="xs">
                {heroSignals.map((item) => (
                  <Group className="hero-signal-row" gap="sm" key={item.title}>
                    <Text className="hero-signal-title" fw={700}>
                      {item.title}
                    </Text>
                    <Text
                      c="dimmed"
                      className="hero-signal-description"
                      size="sm"
                    >
                      {renderInlineCode(item.description)}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Grid.Col>
          </Grid>
        </Stack>
      </Card>

      <SectionCard title="What this package does">
        <FeatureGrid items={overviewValueProps} />
      </SectionCard>

      <SectionCard title="How it works in one pass">
        <StepList steps={quickStartSteps} />
      </SectionCard>

      <SectionCard title="Channel terms">
        <FeatureGrid items={supportSnapshot} />
      </SectionCard>

      <SectionCard title="Start with a working config">
        <Stack gap="md">
          <Alert
            color="blue"
            radius="md"
            title="Good first move"
            variant="light"
          >
            Use <Code>secondParty: console</Code> or <Code>otel-json</Code>{" "}
            first if you want a local proof before wiring first-party HTTP auth.
          </Alert>
          <CodeCard example={quickStartExample} />
        </Stack>
      </SectionCard>

      <SectionCard title="What ships today">
        <FeatureGrid items={overviewSupportHighlights} />
      </SectionCard>

      <SectionCard title="Known limits">
        <List spacing="sm">
          {overviewLimits.map((item) => (
            <List.Item key={item}>{renderInlineCode(item)}</List.Item>
          ))}
        </List>
      </SectionCard>
    </PageFrame>
  );
};

export { OverviewPage };
