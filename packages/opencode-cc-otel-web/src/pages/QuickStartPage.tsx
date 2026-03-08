import { List } from "@mantine/core";
import { CodeCard } from "../components/CodeCard";
import { renderInlineCode } from "../components/InlineCode";
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

      <SectionCard title="Config files">
        <CodeCard example={quickStartExample} />
      </SectionCard>

      <SectionCard title="Quick checks">
        <List spacing="sm">
          {quickStartChecks.map((item) => (
            <List.Item key={item}>{renderInlineCode(item)}</List.Item>
          ))}
        </List>
      </SectionCard>
    </PageFrame>
  );
};

export { QuickStartPage };
