import type { Section, SectionId } from "../sections";

interface SidebarProps {
  sections: Section[];
  activeId: SectionId;
  onSelect: (id: SectionId) => void;
}

/**
 * Persistent left rail: Synchron wordmark plus placeholder navigation.
 */
export function Sidebar({ sections, activeId, onSelect }: SidebarProps) {
  const workspaceSections = sections.filter((section) =>
    ["home", "today", "projects"].includes(section.id),
  );
  const workSections = sections.filter((section) =>
    ["actions", "inbox"].includes(section.id),
  );
  const settings = sections.find((section) => section.id === "settings");

  function renderSections(items: Section[]) {
    return (
      <ul className="nav__list">
        {items.map((section) => {
          const Icon = section.icon;
          const isActive = section.id === activeId;

          return (
            <li
              key={section.id}
              className={isActive ? "nav__item nav__item--active" : "nav__item"}
            >
              <button
                type="button"
                className="nav__button"
                aria-label={section.label}
                title={section.label}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelect(section.id)}
              >
                <Icon className="nav__icon" aria-hidden="true" />
                <span className="nav__label">{section.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand__word">Synchron<span className="brand__period">.</span></span>
        <span className="brand__caption">PROJECT WORKSPACE</span>
      </div>

      <nav className="nav" aria-label="Primary">
        <div className="nav__group">
          <h2 className="nav__heading">Workspace</h2>
          {renderSections(workspaceSections)}
        </div>
        <div className="nav__group">
          <h2 className="nav__heading">Work</h2>
          {renderSections(workSections)}
        </div>
      </nav>

      {settings && (
        <div className="sidebar__settings">
          <span className="nav__heading">Preferences</span>
          {renderSections([settings])}
        </div>
      )}
    </aside>
  );
}
