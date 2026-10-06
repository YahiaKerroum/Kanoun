import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { navItemVariants, navPillTransition } from "./motion.js";

export const administrationPages = [
  { id: "setup", label: "Setup", path: "/setup" },
  { id: "context", label: "Overview", path: "/context" },
  { id: "employees", label: "Staff", path: "/employees" },
  { id: "menu", label: "Menu", path: "/menu" },
  { id: "tables", label: "Tables & QR", path: "/tables" },
  { id: "insights", label: "Reports", path: "/insights" },
  { id: "features", label: "Features", path: "/features" },
] as const;

export type AdministrationPage = (typeof administrationPages)[number]["id"];

export interface AdministrationNavigationItem {
  readonly id: AdministrationPage;
  readonly label: string;
  readonly path: string;
}

function pageFromPathname(pathname: string): AdministrationPage {
  // What someone can do is edited on their Staff panel; keep old links working.
  if (pathname === "/permissions") return "employees";
  const page = administrationPages.find((item) => item.path === pathname);
  return page?.id ?? "context";
}

function pathForPage(page: AdministrationPage): string {
  return (
    administrationPages.find((item) => item.id === page)?.path ?? "/context"
  );
}

export function useAdministrationPage(): {
  readonly page: AdministrationPage;
  readonly navigate: (page: AdministrationPage) => void;
} {
  const [page, setPage] = useState<AdministrationPage>(() =>
    pageFromPathname(window.location.pathname),
  );

  useEffect(() => {
    const expectedPath = pathForPage(page);
    const isAuthPath =
      window.location.pathname.startsWith("/auth/") ||
      window.location.pathname === "/invite/accept";
    if (!isAuthPath && window.location.pathname !== expectedPath) {
      window.history.replaceState({}, "", expectedPath);
    }
    const currentPage = administrationPages.find((item) => item.id === page);
    document.title = `${currentPage?.label ?? "Back office"} — Kanoun`;
  }, [page]);

  useEffect(() => {
    const synchronizePage = () => {
      startTransition(() =>
        setPage(pageFromPathname(window.location.pathname)),
      );
    };
    window.addEventListener("popstate", synchronizePage);
    return () => window.removeEventListener("popstate", synchronizePage);
  }, []);

  const navigate = useCallback((nextPage: AdministrationPage) => {
    window.history.pushState({}, "", pathForPage(nextPage));
    startTransition(() => setPage(nextPage));
    window.requestAnimationFrame(() => {
      const content = document.querySelector<HTMLElement>(".setup-content");
      content?.focus({ preventScroll: true });
      content?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, []);

  return { page, navigate };
}

export function AdministrationNavigation({
  activePage,
  items,
  onNavigate,
}: {
  readonly activePage: AdministrationPage;
  readonly items: readonly AdministrationNavigationItem[];
  readonly onNavigate: (page: AdministrationPage) => void;
}) {
  const navigation = useRef<HTMLElement>(null);
  const activeLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const navigationElement = navigation.current;
    const linkElement = activeLink.current;
    if (navigationElement === null || linkElement === null) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      navigationElement.scrollTo({
        left:
          linkElement.offsetLeft -
          (navigationElement.clientWidth - linkElement.clientWidth) / 2,
        behavior: "auto",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePage]);

  const handleClick = (
    event: MouseEvent<HTMLAnchorElement>,
    page: AdministrationPage,
  ) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onNavigate(page);
  };

  return (
    <MotionConfig reducedMotion="user">
      <nav ref={navigation} aria-label="Administration sections">
        {items.map((item) => {
          const isActive = activePage === item.id;
          return (
            <motion.a
              key={item.id}
              ref={isActive ? activeLink : undefined}
              href={item.path}
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "is-active" : undefined}
              onClick={(event) => handleClick(event, item.id)}
              animate={isActive ? "active" : "rest"}
              variants={navItemVariants}
              style={{
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <AnimatePresence>
                {isActive ? (
                  <motion.span
                    key="admin-nav-pill"
                    layoutId="admin-active-nav-pill"
                    className="admin-nav-pill"
                    aria-hidden="true"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={navPillTransition}
                  />
                ) : null}
              </AnimatePresence>
              {item.label}
            </motion.a>
          );
        })}
      </nav>
    </MotionConfig>
  );
}
