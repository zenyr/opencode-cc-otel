import { Anchor, Stack, Text } from "@mantine/core";
import type { LinkDef } from "../content";

const LinkList = ({ links }: { links: LinkDef[] }) => {
  return (
    <Stack gap="sm">
      {links.map((link) => (
        <Anchor
          className="resource-link"
          href={link.href}
          key={link.label}
          target="_blank"
        >
          <Stack gap={2}>
            <Text fw={600}>{link.label}</Text>
            <Text c="dimmed" size="sm">
              {link.description}
            </Text>
          </Stack>
        </Anchor>
      ))}
    </Stack>
  );
};

export { LinkList };
