import { Box, Stack, Text } from "@mantine/core";
import { pageGroups } from "../content";
import type { PageId } from "../content";

const Navigation = ({
  activePage,
  onNavigate,
}: {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}) => {
  return (
    <Stack className="sidebar-shell" gap="lg">
      {pageGroups.map((group) => (
        <Stack gap={6} key={group.group}>
          <Text className="sidebar-group-label">{group.group}</Text>
          <Stack gap={4}>
            {group.pages.map((page) => {
              const isActive = page.id === activePage;

              return (
                <Box
                  aria-current={isActive ? "page" : undefined}
                  className="sidebar-link"
                  component="button"
                  data-active={isActive || undefined}
                  key={page.id}
                  onClick={() => onNavigate(page.id)}
                  type="button"
                >
                  <Text className="sidebar-link-label">{page.label}</Text>
                </Box>
              );
            })}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
};

export { Navigation };
