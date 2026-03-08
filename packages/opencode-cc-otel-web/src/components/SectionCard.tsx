import { Card, Stack, Title } from "@mantine/core";
import type { ReactNode } from "react";

const SectionCard = ({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) => {
  return (
    <Card className="section-card" padding="xl" radius="lg" withBorder>
      <Stack gap="md">
        <Title order={2}>{title}</Title>
        {children}
      </Stack>
    </Card>
  );
};

export { SectionCard };
