import { Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import type { PageMeta } from "../content";

const PageFrame = ({
  children,
  page,
  showIntro = true,
}: {
  children: ReactNode;
  page: PageMeta;
  showIntro?: boolean;
}) => {
  return (
    <Stack className="page-stack" gap="xl">
      {showIntro ? (
        <Stack gap="xs">
          <Text className="page-eyebrow">{page.label}</Text>
          <Title className="page-title" order={1}>
            {page.title}
          </Title>
          <Text c="dimmed" className="page-description" size="lg">
            {page.description}
          </Text>
        </Stack>
      ) : null}
      {children}
    </Stack>
  );
};

export { PageFrame };
