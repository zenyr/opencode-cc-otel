import { List, Stack } from "@mantine/core";
import { FeatureGrid } from "../components/FeatureGrid";
import { renderInlineCode } from "../components/InlineCode";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { SimpleTable } from "../components/SimpleTable";
import { coverageFamilies, emittedOutputs, knownGaps } from "../content";
import type { PageMeta } from "../content";

const CoveragePage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Coverage">
        <Stack gap="md">
          <FeatureGrid items={coverageFamilies} />
          <SimpleTable rows={emittedOutputs} valueLabel="Transport" />
          <List spacing="sm">
            {knownGaps.map((item) => (
              <List.Item key={item}>{renderInlineCode(item)}</List.Item>
            ))}
          </List>
        </Stack>
      </SectionCard>
    </PageFrame>
  );
};

export { CoveragePage };
