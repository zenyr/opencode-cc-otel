import { Card, Paper, Stack, Text, Title } from "@mantine/core";
import type { CodeExample } from "../content";

const CodeCard = ({ example }: { example: CodeExample }) => {
  return (
    <Card className="code-card" padding="lg" radius="lg" withBorder>
      <Stack gap="sm">
        <Stack gap={4}>
          <Title order={4}>{example.title}</Title>
          <Text c="dimmed" size="sm">
            {example.description}
          </Text>
        </Stack>
        <Paper
          className="code-block"
          component="pre"
          p="md"
          radius="md"
          withBorder
        >
          <code>{example.code}</code>
        </Paper>
      </Stack>
    </Card>
  );
};

export { CodeCard };
