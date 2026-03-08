import { Code, Divider, Stack, Text } from "@mantine/core";
import { FeatureGrid } from "../components/FeatureGrid";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { SimpleTable } from "../components/SimpleTable";
import { channelModelCards, configPaths, configSurfaces } from "../content";
import type { PageMeta } from "../content";

const ConfigModelPage = ({
  page,
  schemaHref,
}: { page: PageMeta; schemaHref: string }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Channel model">
        <FeatureGrid items={channelModelCards} />
      </SectionCard>

      <SectionCard title="Config">
        <Stack gap="sm">
          <SimpleTable rows={configSurfaces} valueLabel="Role" />
          <Divider />
          <SimpleTable rows={configPaths} valueLabel="Value" />
          <Text c="dimmed" size="sm">
            Schema: <Code>{schemaHref}</Code>
          </Text>
        </Stack>
      </SectionCard>
    </PageFrame>
  );
};

export { ConfigModelPage };
