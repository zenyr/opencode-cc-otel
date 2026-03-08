import { pages } from "../content";
import type { PageId } from "../content";

const fallbackPage: PageId = "overview";

const requireFallbackPageMeta = () => {
  const page = pages.find((item) => item.id === fallbackPage);

  if (!page) {
    throw new Error("fallback page missing");
  }

  return page;
};

const fallbackPageMeta = requireFallbackPageMeta();

const isPageId = (value: string): value is PageId => {
  return pages.some((page) => page.id === value);
};

const readPage = (): PageId => {
  const hash = window.location.hash.replace(/^#\/?/, "").trim();
  return isPageId(hash) ? hash : fallbackPage;
};

const resolveSchemaHref = () => {
  const pathname = window.location.pathname;
  const basePath = pathname.endsWith("/")
    ? pathname
    : `${pathname.slice(0, pathname.lastIndexOf("/") + 1)}`;

  return `${basePath}schemas/telemetry.schema.json`;
};

const navigateTo = (page: PageId) => {
  const nextHash = `#/${page}`;

  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
    return;
  }

  window.scrollTo({ behavior: "smooth", top: 0 });
};

export {
  fallbackPage,
  fallbackPageMeta,
  navigateTo,
  readPage,
  resolveSchemaHref,
};
