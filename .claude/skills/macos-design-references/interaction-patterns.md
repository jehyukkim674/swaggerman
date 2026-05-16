# Interaction Patterns Reference

## Table of Contents
1. Keyboard Shortcuts
2. Visual Feedback & Micro-Animations
3. Search Patterns
4. Drag and Drop
5. Optimistic UI
6. Onboarding
7. Floating Action Bars

---

## 1. Keyboard Shortcuts

macOS is filled with keyboard shortcuts. They are a first-class interaction pattern, not an afterthought.

**Rules:**
- Every primary action MUST have a keyboard shortcut
- Show shortcut hints next to actions (e.g., button label + "⌘S" in lighter text)
- Use standard macOS conventions where applicable:
  - `⌘N` — New
  - `⌘F` — Find/Search
  - `⌘W` — Close window/tab
  - `⌘,` — Preferences/Settings
  - `⌘⇧S` — Save As / Quick Save
  - `⌘Space` — Spotlight-style search
  - `⌘Tab` — Switch (adapt to your context)
  - `Esc` — Dismiss/Close/Cancel
  - `Enter/Return` — Confirm/Submit

**Shortcut hint rendering:**
```
⌘  →  Command (looped square icon)
⇧  →  Shift
⌥  →  Option
⌃  →  Control
```

Display these in small rounded `<kbd>` style boxes:
```css
.kbd {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  font-size: 11px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  background: rgba(128,128,128,0.12);
  border-radius: 4px;
  border: 0.5px solid rgba(128,128,128,0.2);
  color: inherit;
  opacity: 0.6;
  gap: 2px;
}
```

**Shortcut cheat sheet**: Provide a settings/preferences panel or a dedicated shortcut overlay (like Google Docs' `⌘/`). Ironically triggered by another keyboard shortcut.

**Critical**: Keyboard shortcuts are powerful but easy to forget. Educate users through:
- Onboarding that teaches by doing (not reading)
- Persistent hints next to buttons
- A discoverable cheat sheet

---

## 2. Visual Feedback & Micro-Animations

**Core principle**: If you don't see a change, you assume something went wrong. Every interaction needs immediate visual feedback.

**State changes that need animation:**
- Panel sliding in/out (quicksave, preview, sidebar)
- Search bar expanding/collapsing
- Items appearing in a grid (stagger in)
- Toast notifications entering and exiting
- Hover states on cards and buttons
- Active/selected state changes
- Drag start/drag over/drop states

**Animation guidelines:**
```css
/* Standard macOS-feel transitions */
--ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);    /* slight overshoot */
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);

/* Durations */
--duration-fast: 150ms;     /* hover states, small changes */
--duration-normal: 250ms;   /* panels, expansions */
--duration-slow: 400ms;     /* page-level transitions */

/* Standard transition */
transition: all var(--duration-normal) var(--ease-out);
```

**Slide-in panels:**
```css
.panel-enter {
  transform: translateX(100%);
  opacity: 0;
}
.panel-active {
  transform: translateX(0);
  opacity: 1;
  transition: transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94),
              opacity 200ms ease;
}
```

**Toast notifications:**
- Enter: slide up + fade in from bottom-right (or bottom-center)
- Persist: 2-3 seconds
- Exit: slide right + fade out
- Should feel lightweight — small, rounded, with an icon + short text

**Collapse/Expand (e.g., search bar):**
```css
.search-collapsed {
  width: 40px;
  border-radius: 20px;
  overflow: hidden;
}
.search-expanded {
  width: 320px;
  border-radius: 8px;
}
/* Transition between states */
.search-bar {
  transition: width 250ms var(--ease-out), border-radius 250ms var(--ease-out);
}
```

---

## 3. Search Patterns

Search is present in virtually every native macOS app. It must be prominent and accessible.

### Option A: Floating Search Bar (Recommended for single-screen apps)
- Lives at the bottom or top of the content area
- Collapses to a small icon/pill when not in use
- Expands on click or keyboard shortcut (`⌘F`)
- Shows result count inline
- Has a clear button (✕) to reset
- Search query appears as a label/breadcrumb when active

```
[Browse]  ←  [🔍 "mobile app houses"  —  7 results  ✕]
```

### Option B: Command Palette (Better for multi-screen apps)
- Triggered by `⌘K` or `⌘Space`
- Centered floating modal with backdrop blur
- Type to search across everything: pages, items, actions, settings
- Results grouped by category
- Keyboard-navigable (arrow keys + enter)
- Most powerful apps (Notion, Obsidian, Raycast, VS Code) use this

### Option C: Inline Top Bar Search (Apple's standard)
- Persistent search field in the top bar, right-aligned
- Standard macOS search field appearance (rounded, magnifying glass icon, cancel button)
- Filters content in real-time as you type
- Used by: Finder, Music, Photos, App Store

**Choosing which pattern:**
- Single-screen utility with visual content → **Floating Search Bar**
- Complex app with many sections/actions → **Command Palette**
- Standard content browser → **Inline Top Bar Search**

### Image-Based Search
If content is visual, consider AI-powered search that matches what's IN the image, not just titles/tags. Show results in a sidebar slideout with thumbnails of similar content. This is a differentiator that makes the app feel magical.

---

## 4. Drag and Drop

Apple has this down to a science. Drag and drop is non-negotiable for native feel.

**Content IN:**
- Drop zones should be obvious — highlight on dragover with a dashed border + accent color
- Accept from Finder, other apps, desktop
- Quick-save panels should accept drops directly
- Show a preview of what will be added before confirming

**Content OUT:**
- Any visual content should be draggable
- Dragging should create a ghost/preview that follows the cursor
- Drop into Figma, Finder, other apps, or desktop
- The drag image should be a scaled-down version of the content

**Visual feedback during drag:**
```css
.drop-zone-active {
  border: 2px dashed var(--accent-color);
  background: rgba(var(--accent-rgb), 0.05);
  transition: all 150ms ease;
}

.dragging-item {
  opacity: 0.5;
  transform: scale(0.95);
  cursor: grabbing;
}
```

**Implementation notes for web/React:**
- Use `onDragStart`, `onDragOver`, `onDragEnd`, `onDrop`
- Set `draggable="true"` on content items
- Use `e.dataTransfer.setData()` and `e.dataTransfer.setDragImage()`
- For file drops: handle `onDrop` with `e.dataTransfer.files`

---

## 5. Optimistic UI

Process actions in the background and assume success. Show the result immediately.

**Examples:**
- Save an image → immediately show toast "Saved!" → process upload in background
- Delete an item → immediately remove from grid → delete from storage in background
- Move to folder → immediately update UI → sync in background

**Why:** Eliminates perceived latency. The app feels instant. Apple Mail does this — moving email to trash updates the UI before the server confirms deletion.

**Implementation pattern:**
```
1. User triggers action
2. Immediately update local state / UI
3. Show success feedback (toast, animation)
4. Process actual operation async
5. On failure: revert state + show error toast
```

**Toast for optimistic actions:**
- Short text: "Saved" / "Copied" / "Deleted"
- Small icon (checkmark)
- Auto-dismiss after 2s
- Slide away gracefully

---

## 6. Onboarding

Not standard for Apple's own apps, but critical for third-party Mac apps (Raycast does this excellently).

**Principles:**
- Keep it brief — a single modal, not a multi-step wizard
- Teach by DOING, not reading
- Focus on the 1-2 most important shortcuts/interactions
- The way to dismiss onboarding IS the shortcut (e.g., "Press ⌘⇧S to get started" → executing the shortcut closes the modal and opens the quicksave panel)
- Use micro-animations to demonstrate interactions
- Show, don't tell

**Structure:**
```
┌──────────────────────────────────┐
│                                  │
│     [Icon or animation]          │
│                                  │
│   Welcome to [App Name]          │
│                                  │
│   Save inspiration instantly     │
│   from anywhere.                 │
│                                  │
│   Press ⌘⇧S to start            │
│                                  │
│      [subtle pulse animation     │
│       on the shortcut hint]      │
│                                  │
└──────────────────────────────────┘
```

**Shortcut cheat sheet** (in settings):
- Grid of all shortcuts
- Grouped by category
- Triggered by its own shortcut (e.g., `⌘?` or `⌘/`)
- Can also live in a settings popover

---

## 7. Floating Action Bars

When viewing content in a detail/preview panel, provide a floating action bar for quick actions.

**Design:**
- Pill-shaped, horizontally laid out
- Floats at the bottom of the preview panel
- Slight backdrop blur + shadow
- Icons only (with tooltip on hover) or icon + short label
- Common actions: Copy, Share, Find Similar, Delete

```
┌─────────────────────────────────┐
│         [Preview Image]          │
│                                  │
│                                  │
│    ┌───────────────────────┐     │
│    │ 📋  🔗  🔍  🗑️       │     │
│    └───────────────────────┘     │
└─────────────────────────────────┘
```

**CSS pattern:**
```css
.floating-action-bar {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.7);
  backdrop-filter: blur(20px);
  border-radius: 10px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  border: 0.5px solid rgba(0,0,0,0.08);
}
/* Dark mode */
@media (prefers-color-scheme: dark) {
  .floating-action-bar {
    background: rgba(50,50,50,0.7);
    border: 0.5px solid rgba(255,255,255,0.1);
  }
}
```

Uses Apple's universal share button pattern (square with up-arrow) where appropriate. The share button should be present for any content that a user might want to export or send somewhere else.

