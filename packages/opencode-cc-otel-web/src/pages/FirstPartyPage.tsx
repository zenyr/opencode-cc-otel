import { Stack } from "@mantine/core";
import { CodeCard } from "../components/CodeCard";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { SimpleTable } from "../components/SimpleTable";
import {
  firstPartyEnvVars,
  firstPartyExample,
  firstPartyRules,
} from "../content";
import type { PageMeta } from "../content";

const FirstPartyPage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Channel rules">
        <SimpleTable rows={firstPartyRules} valueLabel="Value" />
      </SectionCard>

      <SectionCard title="Minimal config">
        <Stack gap="md">
          <SimpleTable rows={firstPartyEnvVars} valueLabel="Default" />
          <CodeCard example={firstPartyExample} />
        </Stack>
      </SectionCard>
    </PageFrame>
  );
};

export { FirstPartyPage };
