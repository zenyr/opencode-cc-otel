import {
  Card,
  Code,
  List,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { FeatureGrid } from "../components/FeatureGrid";
import { renderInlineCode } from "../components/InlineCode";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { SimpleTable } from "../components/SimpleTable";
import {
  coverageFamilies,
  emittedOutputs,
  knownGaps,
  parityMatrix,
} from "../content";
import type { PageMeta } from "../content";

const parityGroups = ["High", "Medium-high", "Medium", "Low"] as const;

const CoveragePage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Coverage">
        <Stack gap="md">
          <FeatureGrid items={coverageFamilies} />
          <SimpleTable rows={emittedOutputs} valueLabel="Transport" />
          <Table highlightOnHover verticalSpacing="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Area</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {parityMatrix.map((row) => (
                <Table.Tr key={row.area}>
                  <Table.Td>
                    <Code>{row.area}</Code>
                  </Table.Td>
                  <Table.Td>{row.status}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {parityGroups.map((status) => {
            const rows = parityMatrix.filter((row) => row.status === status);
            if (rows.length === 0) {
              return null;
            }

            return (
              <Stack gap="sm" key={status}>
                <Text fw={700}>{status}</Text>
                <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                  {rows.map((row) => (
                    <Card key={row.area} padding="lg" radius="lg" withBorder>
                      <Stack gap="xs">
                        <Text fw={600}>{row.area}</Text>
                        <Text c="dimmed" size="sm">
                          {row.current}
                        </Text>
                        <Text size="sm">{renderInlineCode(row.notes)}</Text>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              </Stack>
            );
          })}
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
