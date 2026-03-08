import { Card, Code, Paper, Stack, Text, Title } from "@mantine/core";
import type { CodeExample } from "../content";
import { renderInlineCode } from "./InlineCode";

const CodeCard = ({ example }: { example: CodeExample }) => {
  const fileBlocks = example.files ?? [];

  return (
    <Card className="code-card" padding="lg" radius="lg" withBorder>
      <Stack gap="sm">
        <Stack gap={4}>
          <Title order={4}>{example.title}</Title>
          <Text c="dimmed" size="sm">
            {renderInlineCode(example.description)}
          </Text>
        </Stack>
        {fileBlocks.length > 0
          ? fileBlocks.map((file) => (
              <Stack gap="xs" key={file.path}>
                <Code>{file.path}</Code>
                <Paper
                  className="code-block"
                  component="pre"
                  p="md"
                  radius="md"
                  withBorder
                >
                  <code>{file.code}</code>
                </Paper>
              </Stack>
            ))
          : null}
        {example.code ? (
          <Paper
            className="code-block"
            component="pre"
            p="md"
            radius="md"
            withBorder
          >
            <code>{example.code}</code>
          </Paper>
        ) : null}
      </Stack>
    </Card>
  );
};

export { CodeCard };
