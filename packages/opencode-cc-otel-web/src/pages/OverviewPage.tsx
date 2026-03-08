import { Button, Card, Grid, Group, Stack, Text, Title } from "@mantine/core";
import { FeatureGrid } from "../components/FeatureGrid";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import {
  heroActions,
  heroSignals,
  overviewValueProps,
  supportSnapshot,
} from "../content";
import type { PageMeta } from "../content";

const OverviewPage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <Card className="hero-card" padding="xl" radius="xl" withBorder>
        <Stack gap="xl">
          <Grid align="center" gutter="xl">
            <Grid.Col span={{ base: 12, lg: 7 }}>
              <Stack gap="md">
                <Title className="hero-title" order={2}>
                  OpenCode telemetry, aligned to Claude-compatible payloads.
                </Title>
                <Text c="dimmed" size="lg">
                  First-party and second-party channels, with explicit runtime
                  behavior.
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
                      {item.description}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Grid.Col>
          </Grid>
        </Stack>
      </Card>

      <SectionCard title="At a glance">
        <FeatureGrid items={[...overviewValueProps, ...supportSnapshot]} />
      </SectionCard>
    </PageFrame>
  );
};

export { OverviewPage };
