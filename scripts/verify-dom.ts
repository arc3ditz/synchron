/**
 * DOM-level verification: the real App, rendered into jsdom, against a seeded
 * canonical store. Pins the anchor contract, cross-surface navigation, the
 * project row summary, the lifecycle menu, and visit stamping end to end.
 *
 * Run: node --experimental-strip-types scripts/verify-dom.ts
 */

import { JSDOM } from "jsdom";
import { rolldown } from "rolldown";
import { writeFileSync, unlinkSync } from "node:fs";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`, detail === undefined ? "" : detail);
  }
}

/* --- Seeded canonical stores -----------------------------------------------
   Written in their stored shape so this also exercises load and
   normalization, not just the components. */

const earlier = "2026-10-01T12:00:00.000Z";
const lastWeek = "2026-10-18T12:00:00.000Z";
const yesterday = "2026-10-24T12:00:00.000Z";

const LEAD = "lead";
const OTHER = "other";
const PARKED = "parked";

const projectNote = {
  id: "note-lead-1",
  title: "Interview takeaways",
  content: "Pricing comes up a lot.",
  createdAt: yesterday,
  updatedAt: yesterday,
  relatedActionIds: ["a2"],
};

const projectDecision = {
  id: "decision-lead-1",
  title: "Keep a weekly digest",
  statement: "Keep a weekly digest",
  rationale: "Readers asked for it.",
  createdAt: lastWeek,
  updatedAt: lastWeek,
};

const projectsPayload = {
  projects: [
    {
      id: LEAD,
      name: "Lead project",
      description: "The one we are actually shipping.",
      status: "active",
      createdAt: earlier,
      updatedAt: yesterday,
      currentFocus: "Ship the beta",
      resume: { note: "Left off at the outline.", createdAt: lastWeek, updatedAt: lastWeek },
      notes: [projectNote],
      decisions: [projectDecision],
    },
    {
      id: OTHER,
      name: "Other project",
      status: "active",
      createdAt: earlier,
      updatedAt: yesterday,
      notes: [],
      decisions: [],
    },
    {
      id: PARKED,
      name: "Parked project",
      status: "completed",
      createdAt: earlier,
      updatedAt: lastWeek,
      notes: [],
      decisions: [],
    },
  ],
};

const actionsPayload = {
  actions: [
    {
      id: "a1",
      title: "Fix the flaky test",
      status: "open",
      createdAt: lastWeek,
      updatedAt: lastWeek,
      importance: "normal",
      dueDate: "2026-10-20",
      projectId: LEAD,
    },
    {
      id: "a2",
      title: "Write the digest",
      status: "open",
      createdAt: earlier,
      updatedAt: yesterday,
      importance: "high",
      projectId: LEAD,
    },
    {
      id: "a3",
      title: "Draft the tiers page",
      status: "open",
      createdAt: yesterday,
      updatedAt: yesterday,
      importance: "normal",
      projectId: OTHER,
    },
    {
      id: "a4",
      title: "Fold the final report",
      status: "completed",
      createdAt: earlier,
      updatedAt: lastWeek,
      completedAt: lastWeek,
      importance: "normal",
      projectId: PARKED,
    },
  ],
  inbox: [{ id: "inbox-1", title: "Call the auditor", createdAt: yesterday }],
};

const PROJECTS_KEY = "synchron.projects.v1";
const ACTIONS_KEY = "synchron.actions.v1";

/* --- jsdom ------------------------------------------------------------------ */

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "https://synchron.test/",
  pretendToBeVisual: true,
});

const seedStore = (key: string, value: unknown) => {
  dom.window.localStorage.setItem(key, JSON.stringify(value));
};
seedStore(PROJECTS_KEY, projectsPayload);
seedStore(ACTIONS_KEY, actionsPayload);

// jsdom lacks some web APIs the app touches incidentally.
const mediaQuery = () => ({
  matches: false,
  media: "",
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
});
(dom.window as unknown as { matchMedia: unknown }).matchMedia = mediaQuery;
dom.window.Element.prototype.scrollIntoView = () => {};
dom.window.Element.prototype.scrollTo = () => {};
(dom.window as unknown as { scrollTo: unknown }).scrollTo = () => {};

const actEnvironment = globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean };
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

// React reads these globals from the host environment.
const expose = [
  "window",
  "document",
  "navigator",
  "Element",
  "HTMLElement",
  "Node",
  "NodeList",
  "HTMLInputElement",
  "HTMLButtonElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Event",
  "MouseEvent",
  "KeyboardEvent",
  "CustomEvent",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "localStorage",
] as const;
for (const key of expose) {
  try {
    const value = (dom.window as unknown as Record<string, unknown>)[key];
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch (error) {
    check(`jsdom exposes ${key}`, false, error);
  }
}

const document = dom.window.document;

/* --- Helpers ------------------------------------------------------------------ */

async function tick() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function click(selector: string): Element | null {
  const target = document.querySelector(selector);
  if (!target) return null;
  target.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  return target;
}

/** A controlled input needs the native setter for React to see the change. */
function typeInto(selector: string, value: string): boolean {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) return false;
  const prototype = dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(input, value);
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  return true;
}

function sidebarButton(label: string): Element | null {
  return document.querySelector(`.nav__button[aria-label="${label}"]`);
}

function storedProjectsNow(): { projects: Array<Record<string, unknown>> } {
  return JSON.parse(dom.window.localStorage.getItem(PROJECTS_KEY) ?? "{}");
}

/* --- Render ------------------------------------------------------------------ */

// Bundle the app with rolldown so Node can evaluate it as a real module even
// though App imports plain CSS, which Node cannot load on its own. React and
// react-dom stay external so the bundle and this script share one copy. The
// bundle is written inside the project so those bare imports resolve.
const bundle = await rolldown({
  input: new URL("./dom-entry.tsx", import.meta.url).pathname,
  moduleTypes: { ".css": "empty" },
  external: (id) =>
    id === "react" ||
    id.startsWith("react/") ||
    id === "react-dom" ||
    id.startsWith("react-dom/"),
});
const generated = await bundle.generate({ format: "esm", exports: "named" });
const bundlePath = new URL("./.verify-dom-bundle.mjs", import.meta.url).pathname;
writeFileSync(bundlePath, generated.output[0]?.code ?? "", "utf8");

const { App, ConfirmationProvider } = await import(bundlePath);
unlinkSync(bundlePath);

const root = dom.window.document.getElementById("root")!;

const React = (await import("react")) as unknown as {
  StrictMode: unknown;
  createElement: (...args: unknown[]) => unknown;
  act: (fn: () => Promise<void>) => Promise<void>;
};
const ReactDomClient = (await import("react-dom/client")) as unknown as {
  createRoot: (el: Element) => { render: (el: unknown) => void; unmount: () => void };
};
const reactClientRoot = ReactDomClient.createRoot(root);

await React.act(async () => {
  reactClientRoot.render(
    React.createElement(
      React.StrictMode,
      null,
      React.createElement(ConfirmationProvider, null, React.createElement(App)),
    ),
  );
  await tick();
});

await tick();

console.log("Home overview");

check(
  "the app mounts into the document",
  document.querySelector(".app") !== null && document.querySelector(".sidebar") !== null,
);

const homeNextHeading = document.querySelector(".home-next .home-section__eyebrow");
check(
  "home shows the single cross-project next step",
  homeNextHeading?.textContent === "Do this next",
);
check(
  "the next step is the recorded overdue commitment, not an invented one",
  document.querySelector(".home-next")?.textContent?.includes("Fix the flaky test") === true,
);
check(
  "the continue card names the project the user last worked in",
  document.querySelector(".home-continue__name")?.textContent === "Lead project",
);

console.log("Project rows");

await React.act(async () => {
  (sidebarButton("Projects") as HTMLElement | null)?.click();
  await tick();
});
await tick();

check(
  "the default view shows the two active projects",
  document.querySelectorAll(".project-row").length === 2,
);

const rowByName = (name: string) =>
  Array.from(document.querySelectorAll(".project-row")).find(
    (row) => row.querySelector(".project-row__name")?.textContent === name,
  );

check("the first row is the first project", document.querySelector(".project-row .project-row__name")?.textContent === "Lead project");
check(
  "a row names the project's own next action",
  rowByName("Lead project")?.querySelector(".project-row__next")?.textContent?.includes("Fix the flaky test") === true,
);
check(
  "a row states its own counts",
  rowByName("Lead project")?.querySelector(".project-row__count")?.textContent === "2 open actions",
  rowByName("Lead project")?.querySelector(".project-row__count")?.textContent,
);

console.log("Filters and the completed record");

check(
  "the filter bar offers all five states",
  document.querySelectorAll(".filter-bar__button").length === 5,
);

await React.act(async () => {
  const allFilter = Array.from(document.querySelectorAll(".filter-bar__button")).find(
    (button) => button.textContent?.startsWith("All"),
  );
  allFilter?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

check(
  "the All filter shows every stored project",
  document.querySelectorAll(".project-row").length === 3,
);
check(
  "a completed project row shows completed work only",
  rowByName("Parked project")?.querySelector(".project-row__count")?.textContent === "1 completed",
  rowByName("Parked project")?.querySelector(".project-row__count")?.textContent,
);
check(
  "a row carries its status options menu",
  document.querySelector('.project-row__menu-trigger[aria-label="Status and options for Parked project"]') !== null,
);

console.log("Lifecycle menu");

await React.act(async () => {
  const trigger = document.querySelector<HTMLButtonElement>(
    '.project-row__menu-trigger[aria-label="Status and options for Parked project"]',
  );
  trigger?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

const lifeOptions = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Status and options for Parked project"] .menu-option__label'));
check(
  "the row menu offers the lifecycle moves",
  lifeOptions.some((option) => option.textContent === "Reopen"),
);

await React.act(async () => {
  const reopen = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Status and options for Parked project"] .menu-option')).find(
    (option) => option.textContent === "Reopen",
  );
  reopen?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

check(
  "choosing a lifecycle move is persisted to the canonical store",
  storedProjectsNow().projects.find((project) => project.id === PARKED)?.status === "active",
);

console.log("Project detail and the anchor contract");

await React.act(async () => {
  const leadRow = rowByName("Lead project");
  const open = leadRow?.querySelector<HTMLButtonElement>(".project-row__open");
  open?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

check(
  "opening a row opens that project's own workspace",
  document.querySelector(".project-header__title")?.textContent === "Lead project"
    || document.querySelector(".project-detail")?.textContent?.includes("Lead project") === true,
);
check(
  "a visit is stamped once when the project is opened",
  typeof storedProjectsNow().projects.find((project) => project.id === LEAD)?.lastOpenedAt === "string",
);
check(
  "the resume note renders under its stable anchor id",
  document.querySelector("#project-resume-note")?.textContent === "Left off at the outline.",
);
check(
  "the workspace nav offers the sections the project actually has",
  document.querySelectorAll(".workspace-nav__link").length === 4,
);

console.log("Cross-surface navigation");

await React.act(async () => {
  (sidebarButton("Actions") as HTMLElement | null)?.click();
  await tick();
});
await tick();

const projectLink = document.querySelector<HTMLButtonElement>(
  '.action-row__project[aria-label="Open project Lead project"]',
);
check(
  "global action rows name their project as a link",
  projectLink !== null,
);
await React.act(async () => {
  projectLink?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

check(
  "the row link opens the project it names",
  document.querySelector(".project-header__title")?.textContent === "Lead project"
    || document.querySelector(".project-detail")?.textContent?.includes("Lead project") === true,
);

console.log("Search lands on the matched record");

await React.act(async () => {
  (sidebarButton("Search") as HTMLElement | null)?.click();
  await tick();
});
await tick();

check(
  "the search field and hint are present",
  document.querySelector(".search__input") !== null,
);
await React.act(async () => {
  typeInto("#search-input", "digest");
  await tick();
});
await tick();

const decisionHit = Array.from(document.querySelectorAll(".search-result")).find((result) =>
  result.textContent?.includes("Keep a weekly digest"),
);
check(
  "stored notes and decisions are searchable",
  decisionHit !== undefined,
);
await React.act(async () => {
  decisionHit?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

check(
  "opening a search result lands on the anchor it names",
  document.querySelector("#project-decision-decision-lead-1") !== null,
);

console.log("Notes and decisions carry their relationships");

await React.act(async () => {
  const notesLink = document.querySelector(
    '.workspace-nav__link[aria-current="page"]',
  );
  // Open the Notes section of the currently open project.
  const nav = document.querySelectorAll(".workspace-nav__link")[2] as HTMLElement | null;
  void notesLink;
  nav?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

const relatedLink = document.querySelector<HTMLButtonElement>(".context-item__related-link");
check(
  "a related action renders as a navigable link",
  relatedLink?.textContent === "Write the digest",
  relatedLink?.textContent,
);
await React.act(async () => {
  relatedLink?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await tick();
});
await tick();

check(
  "following a related action switches to the Tasks section on its anchor",
  document.querySelector('.workspace-nav__link--active')?.textContent?.startsWith("Tasks") === true
    && document.querySelector("#project-action-a2") !== null,
);

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All DOM-level checks passed.");

/* --- Teardown ------------------------------------------------------------------ */

await React.act(async () => {
  reactClientRoot.unmount();
});
