import type { KeyboardEvent } from 'react';
import { NAV_GROUPS, type PanelId } from '../panels';
import { Icon } from './Icon';

export interface SidebarProps {
  active: PanelId;
  onSelect: (id: PanelId) => void;
}

/**
 * Left navigation for the settings window.
 *
 * Rendered as a tablist so arrow-key navigation and the active state are
 * conveyed to assistive tech; each item controls the matching panel element.
 */
export function Sidebar({ active, onSelect }: SidebarProps) {
  const flatIds = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));

  /** Roving focus: arrows move between tabs, Home/End jump to the ends. */
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: PanelId) {
    const index = flatIds.indexOf(id);
    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = (index + 1) % flatIds.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex = (index - 1 + flatIds.length) % flatIds.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = flatIds.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextId = flatIds[nextIndex];
    onSelect(nextId);
    // Move focus to follow selection, as expected for an automatic tablist.
    document.getElementById(`nav-${nextId}`)?.focus();
  }

  return (
    <nav className="sidebar" aria-label="设置分类">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark font-display">AISpur</span>
        <span className="sidebar__brand-version font-mono">v2</span>
      </div>

      <div className="sidebar__groups" role="tablist" aria-orientation="vertical">
        {NAV_GROUPS.map((group) => (
          <div className="nav-group" key={group.label}>
            <h2 className="nav-group__label font-mono">{group.label}</h2>
            {group.items.map((item) => {
              const isActive = item.id === active;
              return (
                <button
                  key={item.id}
                  id={`nav-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`panel-${item.id}`}
                  tabIndex={isActive ? 0 : -1}
                  className={`nav-item${isActive ? ' nav-item--active' : ''}`}
                  onClick={() => onSelect(item.id)}
                  onKeyDown={(event) => handleKeyDown(event, item.id)}
                >
                  <Icon name={item.icon} className="nav-item__icon" />
                  <span className="nav-item__label">{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
