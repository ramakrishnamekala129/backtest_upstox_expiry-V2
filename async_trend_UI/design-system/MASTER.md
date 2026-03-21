# TrendDates Design System

This design system covers style, typography, and color for the TrendDates dashboard UI.

## Style

- Visual direction: crisp financial analytics with soft sky gradients and glass-like panels.
- Surface treatment: elevated cards with subtle inner highlights and soft shadows.
- Corners: 12-24px radius based on component scale.
- Dividers: thin, cool-blue lines (low-contrast in light mode).
- Motion: fast, restrained (120-300ms). Avoid bouncy/elastic effects.
- Iconography: SVG icon set only (no emojis). Stroke width consistent.

## Typography

- Headings: Sora (700-800)
- Body: DM Sans (400-700)
- Numerics: tabular alignment where possible (use font-variant-numeric: tabular-nums when needed)
- Base size: 16px
- Line height: 1.5 for body, 1.1-1.25 for headings
- Letter spacing: +0.08em for small uppercase labels

### Type Scale

- Display / H1: 36-44px, 700-800, line-height 1.05-1.1
- H2: 24-28px, 700
- H3: 18-20px, 700
- Body: 15-16px, 400-600
- Small: 12-13px, 600-700

## Spacing

Use a 4px base with a tight UI rhythm. Apply consistently across cards, filters, and table sections.

- 4px: micro gaps, icon padding
- 8px: compact inline groups, chip padding
- 12px: input padding, small cards
- 16px: standard block spacing
- 20px: section padding
- 24px: panel padding
- 32px: major section separation
- 40px: hero spacing, large gaps
- 48px: page-level vertical rhythm

## Radius

- Small: 10-12px (inputs, chips)
- Medium: 14-18px (cards, panels)
- Large: 24px (hero blocks)

## Shadows

- Cards: soft blue shadow (12-30px spread, 10% opacity)
- Hero: slightly stronger shadow with inner highlight
- Buttons: crisp, short shadow for depth

## Color

### Brand and Core

- Brand primary: #4B9CFF
- Brand secondary: #8BC5FF
- Ink (primary text): #0D223A
- Muted text: #4D6785
- Background: #F7FBFF
- Elevated background: #EEF5FF
- Card: #FFFFFF
- Line / borders: #B8CFF0

### Usage Guidance

- Primary actions: brand primary on white, white text
- Secondary actions: light blue surface with ink text
- Tables: header background #DFEEFF, zebra rows #EAF3FF
- Focus rings: brand primary at 20% alpha
- Avoid low-contrast light gray text (do not use below #475569 equivalent)

### Semantic Tokens

Use these tokens to keep UI consistent and accessible:

- --bg: #F7FBFF
- --bg-elev: #EEF5FF
- --card: #FFFFFF
- --card-solid: #FFFFFF
- --line: #B8CFF0
- --ink: #0D223A
- --muted: #4D6785
- --accent: #4B9CFF
- --accent-2: #8BC5FF
- --header: #E7F2FF

## Accessibility

- Body text contrast >= 4.5:1
- Touch targets >= 44x44px
- Focus visible on all interactive elements
- Use color + shape or label for state (not color alone)

## Component Specs

### Cards and Panels

- Border: 1px solid line color
- Background: white or white-to-blue gradient
- Radius: 14-18px
- Shadow: card shadow token
- Padding: 16-24px based on density

### Buttons

- Height: 42-48px
- Radius: 12px
- Primary: brand gradient, white text, bold
- Secondary: light blue fill, ink text, 1px border
- Hover: subtle lift (1px) + brightness
- Disabled: 45% opacity, no shadow

### Inputs and Selects

- Height: 42-46px
- Radius: 12px
- Border: line color
- Focus: 3px ring with brand at 20% alpha
- Placeholder: muted blue-gray

### Tables

- Header: sticky, light blue background
- Zebra rows: alternating light blue tints
- Border grid: thin blue lines
- Min width: 720px on mobile, 920px desktop

### Pills and Chips

- Height: 28-32px
- Radius: 12px
- Border: line color
- Background: light blue fill

### Motion

- Use 120-200ms for hover and focus
- Use 300ms max for entrances
- Avoid scale changes that shift layout
