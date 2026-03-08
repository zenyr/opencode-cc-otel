import { Stack } from "@mantine/core";
import { CodeCard } from "../components/CodeCard";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { SimpleTable } from "../components/SimpleTable";
import {
  secondPartyAttrs,
  secondPartyEnvVars,
  secondPartyExample,
  secondPartyModes,
} from "../content";
import type { PageMeta } from "../content";

const SecondPartyPage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Supported modes">
        <SimpleTable rows={secondPartyModes} valueLabel="Use" />
      </SectionCard>

      <SectionCard title="OTEL JSON example">
        <Stack gap="md">
          <SimpleTable rows={secondPartyAttrs} valueLabel="Default" />
          <SimpleTable rows={secondPartyEnvVars} valueLabel="Default" />
          <CodeCard example={secondPartyExample} />
        </Stack>
      </SectionCard>
    </PageFrame>
  );
};

export { SecondPartyPage };
