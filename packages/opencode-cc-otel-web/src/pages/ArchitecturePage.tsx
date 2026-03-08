import { Code, List, Paper, Stack, Table } from "@mantine/core";
import { PageFrame } from "../components/PageFrame";
import { SectionCard } from "../components/SectionCard";
import { architectureFlow, architectureNotes, packageRoles } from "../content";
import type { PageMeta } from "../content";

const ArchitecturePage = ({ page }: { page: PageMeta }) => {
  return (
    <PageFrame page={page}>
      <SectionCard title="Dependency flow">
        <Stack gap="sm">
          <Paper className="flow-block" p="md" radius="lg" withBorder>
            <Code block>{architectureFlow}</Code>
          </Paper>
        </Stack>
      </SectionCard>

      <SectionCard title="Package roles">
        <Table highlightOnHover verticalSpacing="md">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Package</Table.Th>
              <Table.Th>Responsibility</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {packageRoles.map((item) => (
              <Table.Tr key={item.name}>
                <Table.Td>
                  <Code>{item.name}</Code>
                </Table.Td>
                <Table.Td>{item.description}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </SectionCard>

      <SectionCard title="Guardrails">
        <List spacing="sm">
          {architectureNotes.map((item) => (
            <List.Item key={item}>{item}</List.Item>
          ))}
        </List>
      </SectionCard>
    </PageFrame>
  );
};

export { ArchitecturePage };
