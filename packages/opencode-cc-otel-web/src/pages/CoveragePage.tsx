import { Code, List, Stack, Table } from "@mantine/core";
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
                <Table.Th>Current</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {parityMatrix.map((row) => (
                <Table.Tr key={row.area}>
                  <Table.Td>
                    <Code>{row.area}</Code>
                  </Table.Td>
                  <Table.Td>{row.status}</Table.Td>
                  <Table.Td>{row.current}</Table.Td>
                  <Table.Td>{renderInlineCode(row.notes)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
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
