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
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand__word">
          Synchron<span className="brand__period">.</span>
        </span>
      </div>

      <nav className="nav" aria-label="Primary">
        <ul className="nav__list">
          {sections.map((section) => {
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
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => onSelect(section.id)}
                >
                  <Icon className="nav__icon" />
                  <span className="nav__label">{section.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
