import {
  AppShell,
  Box,
  Burger,
  Button,
  Container,
  Drawer,
  Group,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { Navigation } from "./components/Navigation";
import { pages } from "./content";
import type { PageId, PageMeta } from "./content";
import {
  fallbackPage,
  fallbackPageMeta,
  navigateTo,
  readPage,
  resolveSchemaHref,
} from "./lib/routing";
import { ArchitecturePage } from "./pages/ArchitecturePage";
import { ConfigModelPage } from "./pages/ConfigModelPage";
import { CoveragePage } from "./pages/CoveragePage";
import { FirstPartyPage } from "./pages/FirstPartyPage";
import { OverviewPage } from "./pages/OverviewPage";
import { QuickStartPage } from "./pages/QuickStartPage";
import { RuntimePage } from "./pages/RuntimePage";
import { SecondPartyPage } from "./pages/SecondPartyPage";

const landingHeaderPageIds: PageId[] = [
  "quickstart",
  "config-model",
  "coverage",
];

const renderPage = ({
  page,
  schemaHref,
}: {
  page: PageMeta;
  schemaHref: string;
}) => {
  switch (page.id) {
    case "overview":
      return <OverviewPage page={page} />;
    case "quickstart":
      return <QuickStartPage page={page} />;
    case "config-model":
      return <ConfigModelPage page={page} schemaHref={schemaHref} />;
    case "first-party":
      return <FirstPartyPage page={page} />;
    case "second-party":
      return <SecondPartyPage page={page} />;
    case "coverage":
      return <CoveragePage page={page} />;
    case "runtime":
      return <RuntimePage page={page} />;
    case "architecture":
      return <ArchitecturePage page={page} />;
    default:
      return <OverviewPage page={page} />;
  }
};

const App = () => {
  const [activePage, setActivePage] = useState<PageId>(() => readPage());
  const [drawerOpened, drawerHandlers] = useDisclosure(false);
  const schemaHref = useMemo(() => resolveSchemaHref(), []);
  const currentPage =
    pages.find((page) => page.id === activePage) ?? fallbackPageMeta;
  const isOverviewPage = currentPage.id === "overview";
  const landingHeaderPages = pages.filter((page) =>
    landingHeaderPageIds.includes(page.id),
  );

  useEffect(() => {
    const syncRoute = () => {
      const nextPage = readPage();
      setActivePage(nextPage);
      drawerHandlers.close();
      window.scrollTo({ behavior: "auto", top: 0 });
    };

    if (!window.location.hash) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#/${fallbackPage}`,
      );
      setActivePage(fallbackPage);
    } else {
      syncRoute();
    }

    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
    };
  }, [drawerHandlers]);

  useEffect(() => {
    document.title = `${currentPage.label} | OpenCode Telemetry`;
  }, [currentPage]);

  return (
    <AppShell header={{ height: 72 }} padding={0}>
      <AppShell.Header className="site-header">
        <Container className="header-inner" h="100%" size="xl">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Button
              className="brand-button"
              onClick={() => navigateTo("overview")}
              variant="subtle"
            >
              <Text fw={700}>opencode-cc-otel</Text>
            </Button>

            <Group gap="xs" visibleFrom="md">
              {isOverviewPage
                ? landingHeaderPages.map((page) => (
                    <Button
                      key={page.id}
                      onClick={() => navigateTo(page.id)}
                      variant="subtle"
                    >
                      {page.label}
                    </Button>
                  ))
                : null}
              <Button
                component="a"
                href="https://github.com/zenyr/opencode-cc-otel"
                target="_blank"
                variant="subtle"
              >
                GitHub
              </Button>
            </Group>

            <Burger
              aria-label="Open navigation"
              hiddenFrom="md"
              onClick={drawerHandlers.toggle}
              opened={drawerOpened}
            />
          </Group>
        </Container>
      </AppShell.Header>

      <Drawer
        onClose={drawerHandlers.close}
        opened={drawerOpened}
        padding="md"
        position="left"
        size="88%"
        title="Docs navigation"
      >
        <Navigation activePage={activePage} onNavigate={navigateTo} />
      </Drawer>

      <AppShell.Main className="site-main">
        <Container
          className={isOverviewPage ? "landing-shell" : "docs-shell"}
          px="md"
          py="xl"
          size="xl"
        >
          {isOverviewPage ? (
            renderPage({ page: currentPage, schemaHref })
          ) : (
            <>
              <Box className="docs-grid" visibleFrom="md">
                <aside className="docs-sidebar">
                  <Navigation activePage={activePage} onNavigate={navigateTo} />
                </aside>
                <main className="docs-content">
                  {renderPage({ page: currentPage, schemaHref })}
                </main>
              </Box>

              <Box hiddenFrom="md">
                {renderPage({ page: currentPage, schemaHref })}
              </Box>
            </>
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
};

export { App };
