import { List } from "@mantine/core";
import { CodeCard } from "../components/CodeCard";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { StepList } from "../components/StepList";
import {
  quickStartChecks,
  quickStartExample,
  quickStartSteps,
} from "../content";
import type { PageMeta } from "../content";

const QuickStartPage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Core workflow">
        <StepList steps={quickStartSteps} />
      </SectionCard>

      <SectionCard title="Starter config">
        <CodeCard example={quickStartExample} />
      </SectionCard>

      <SectionCard title="What to verify first">
        <List spacing="sm">
          {quickStartChecks.map((item) => (
            <List.Item key={item}>{item}</List.Item>
          ))}
        </List>
      </SectionCard>
    </PageFrame>
  );
};

export { QuickStartPage };
