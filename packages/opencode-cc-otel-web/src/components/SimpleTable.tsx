import { Code, Table } from "@mantine/core";
import type { RowDef } from "../content";

const SimpleTable = ({
  rows,
  valueLabel,
}: {
  rows: RowDef[];
  valueLabel: string;
}) => {
  return (
    <Table highlightOnHover verticalSpacing="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>{valueLabel}</Table.Th>
          <Table.Th>Description</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={row.name}>
            <Table.Td>
              <Code>{row.name}</Code>
            </Table.Td>
            <Table.Td>{row.value}</Table.Td>
            <Table.Td>{row.description}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
};

export { SimpleTable };
