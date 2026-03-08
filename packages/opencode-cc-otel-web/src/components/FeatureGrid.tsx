import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import type { FeatureCard } from "../content";
import { renderInlineCode } from "./InlineCode";

const FeatureGrid = ({ items }: { items: FeatureCard[] }) => {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {items.map((item) => (
        <Card key={item.title} padding="lg" radius="lg" withBorder>
          <Stack gap="xs">
            <Text fw={600}>{item.title}</Text>
            <Text c="dimmed" size="sm">
              {renderInlineCode(item.description)}
            </Text>
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
};

export { FeatureGrid };
