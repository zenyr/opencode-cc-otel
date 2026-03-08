import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import type { StepDef } from "../content";

const StepList = ({ steps }: { steps: StepDef[] }) => {
  return (
    <Stack gap="sm">
      {steps.map((step, index) => (
        <Group
          align="flex-start"
          className="step-row"
          gap="md"
          key={step.title}
          wrap="nowrap"
        >
          <ThemeIcon
            className="step-icon"
            radius="xl"
            size={34}
            variant="light"
          >
            {index + 1}
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={600}>{step.title}</Text>
            <Text c="dimmed" size="sm">
              {step.body}
            </Text>
          </Stack>
        </Group>
      ))}
    </Stack>
  );
};

export { StepList };
