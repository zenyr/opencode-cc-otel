import { Anchor, Stack, Text } from "@mantine/core";
import type { LinkDef } from "../content";
import { renderInlineCode } from "./InlineCode";

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
              {renderInlineCode(link.description)}
            </Text>
          </Stack>
        </Anchor>
      ))}
    </Stack>
  );
};

export { LinkList };
