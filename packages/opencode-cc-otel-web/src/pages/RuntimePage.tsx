import { Stack } from "@mantine/core";
import { FeatureGrid } from "../components/FeatureGrid";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { SimpleTable } from "../components/SimpleTable";
import { runtimeBehaviors, runtimeSettings } from "../content";
import type { PageMeta } from "../content";

const RuntimePage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Runtime">
        <Stack gap="md">
          <FeatureGrid items={runtimeBehaviors} />
          <SimpleTable rows={runtimeSettings} valueLabel="Default" />
        </Stack>
      </SectionCard>
    </PageFrame>
  );
};

export { RuntimePage };
