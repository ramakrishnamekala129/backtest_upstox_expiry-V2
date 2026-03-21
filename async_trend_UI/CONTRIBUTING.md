# Contributing Guide

## Welcome

Thank you for your interest in contributing to TrendDates Vercel UI! This guide will help you get started with development and contribution workflows.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Git Workflow](#git-workflow)
6. [Testing](#testing)
7. [Documentation](#documentation)
8. [Pull Request Process](#pull-request-process)
9. [Code Review](#code-review)
10. [Common Tasks](#common-tasks)

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm or yarn
- Git
- Code editor (VS Code recommended)
- Basic knowledge of:
  - TypeScript
  - React
  - Next.js 14 (App Router)

### First Time Setup

1. **Fork the repository** (if external contributor)

2. **Clone the repository**
```bash
git clone <repository-url>
cd async_trend_UI
```

3. **Install dependencies**
```bash
npm install
```

4. **Set up environment**
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

5. **Run development server**
```bash
npm run dev
```

6. **Verify setup**
- Open `http://localhost:3000`
- Check that the app loads without errors

---

## Development Setup

### Recommended VS Code Extensions

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "usernamehw.errorlens"
  ]
}
```

### VS Code Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### Environment Configuration

```env
# .env.local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
TREND_JSON_PATH=excel_output/trend_tables.json
```

---

## Project Structure

### Directory Overview

```
async_trend_UI/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth route group
│   ├── api/               # API routes
│   ├── astro/             # Astro pages
│   ├── auth/              # Auth callbacks
│   ├── sign-in/           # Sign in page
│   ├── sign-up/           # Sign up page
│   └── page.tsx           # Dashboard
├── components/            # React components
├── lib/                   # Utilities & services
│   ├── astro/            # Astro calculations
│   ├── supabase/         # Supabase integration
│   ├── trend-data.ts     # Data loading
│   └── types.ts          # TypeScript types
├── public/               # Static assets
└── data/                 # Data files
```

### File Naming Conventions

- **Components**: PascalCase (e.g., `TrendDashboard.tsx`)
- **Utilities**: camelCase (e.g., `trend-data.ts`)
- **Types**: PascalCase (e.g., `types.ts`)
- **API Routes**: `route.ts`
- **Pages**: `page.tsx`

---

## Coding Standards

### TypeScript

**Always use TypeScript:**
```typescript
// ✅ Good
export function calculateAspect(angle: number): string {
  return angle.toFixed(2);
}

// ❌ Bad
export function calculateAspect(angle) {
  return angle.toFixed(2);
}
```

**Define types explicitly:**
```typescript
// ✅ Good
interface TrendData {
  date: string;
  value: number;
}

const data: TrendData = { date: "2024-01-01", value: 100 };

// ❌ Bad
const data = { date: "2024-01-01", value: 100 };
```

### React Components

**Use functional components:**
```typescript
// ✅ Good
export function TrendCard({ title, value }: TrendCardProps) {
  return <div>{title}: {value}</div>;
}

// ❌ Bad
export class TrendCard extends React.Component {
  render() {
    return <div>{this.props.title}: {this.props.value}</div>;
  }
}
```

**Use client directive when needed:**
```typescript
// For interactive components
"use client";

import { useState } from "react";

export function InteractiveComponent() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

**Server components by default:**
```typescript
// No "use client" needed for server components
export default async function Page() {
  const data = await fetchData();
  return <div>{data}</div>;
}
```

### CSS

**Use CSS variables:**
```css
/* ✅ Good */
.card {
  background: var(--card-bg);
  color: var(--ink);
}

/* ❌ Bad */
.card {
  background: #ffffff;
  color: #000000;
}
```

**Mobile-first approach:**
```css
/* ✅ Good */
.container {
  padding: 12px;
}

@media (min-width: 768px) {
  .container {
    padding: 24px;
  }
}

/* ❌ Bad */
.container {
  padding: 24px;
}

@media (max-width: 767px) {
  .container {
    padding: 12px;
  }
}
```

### API Routes

**Consistent error handling:**
```typescript
// ✅ Good
export async function GET(request: Request) {
  try {
    const data = await fetchData();
    return NextResponse.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ❌ Bad
export async function GET(request: Request) {
  const data = await fetchData(); // No error handling
  return NextResponse.json({ data });
}
```

### Code Organization

**Group related code:**
```typescript
// ✅ Good
// Imports
import { useState } from "react";
import { fetchData } from "@/lib/api";

// Types
interface Props {
  id: string;
}

// Component
export function Component({ id }: Props) {
  // Hooks
  const [data, setData] = useState(null);
  
  // Effects
  useEffect(() => {
    fetchData(id).then(setData);
  }, [id]);
  
  // Handlers
  const handleClick = () => {
    console.log("clicked");
  };
  
  // Render
  return <div onClick={handleClick}>{data}</div>;
}
```

---

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring
- `test/description` - Test additions

**Examples:**
```bash
feature/add-export-functionality
fix/authentication-redirect
docs/update-api-reference
refactor/simplify-data-loading
```

### Commit Messages

Follow conventional commits:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

**Examples:**
```bash
feat(dashboard): add export to CSV functionality

fix(auth): resolve redirect loop on sign out

docs(api): update planetary aspects endpoint

refactor(components): simplify TrendDashboard logic

test(api): add tests for trends endpoint
```

### Workflow Steps

1. **Create branch**
```bash
git checkout -b feature/your-feature
```

2. **Make changes**
```bash
# Edit files
git add .
git commit -m "feat(scope): description"
```

3. **Keep branch updated**
```bash
git fetch origin
git rebase origin/main
```

4. **Push changes**
```bash
git push origin feature/your-feature
```

5. **Create pull request**
- Go to repository
- Click "New Pull Request"
- Fill in template
- Request review

---

## Testing

### Type Checking

```bash
# Run type checker
npm run typecheck

# Watch mode
npm run typecheck -- --watch
```

### Linting

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### Manual Testing

Before submitting PR, test:

1. **Authentication Flow**
   - Sign up
   - Sign in
   - Sign out
   - Protected routes

2. **Dashboard**
   - Data loads correctly
   - Filters work
   - Search functions
   - Tables display properly

3. **Astro Tools**
   - Calculations complete
   - Results display
   - Export works

4. **Responsive Design**
   - Mobile view
   - Tablet view
   - Desktop view

5. **Theme Toggle**
   - Light mode
   - Dark mode
   - Persistence

### Test Checklist

- [ ] Type check passes
- [ ] Linter passes
- [ ] Build succeeds
- [ ] Manual testing complete
- [ ] No console errors
- [ ] Responsive on all devices

---

## Documentation

### Code Comments

**When to comment:**
```typescript
// ✅ Good - Explain WHY, not WHAT
// Use cached data to avoid expensive recalculation
const cachedResult = cache.get(key);

// ❌ Bad - Obvious from code
// Set count to 0
const count = 0;
```

**JSDoc for functions:**
```typescript
/**
 * Calculates planetary aspect between two planets
 * @param planet1 - First planet name
 * @param planet2 - Second planet name
 * @param angle - Angle between planets in degrees
 * @returns Aspect type (conjunction, opposition, etc.)
 */
export function calculateAspect(
  planet1: string,
  planet2: string,
  angle: number
): string {
  // Implementation
}
```

### README Updates

Update README.md when:
- Adding new features
- Changing setup process
- Modifying configuration
- Adding dependencies

### API Documentation

Update API.md when:
- Adding new endpoints
- Changing request/response format
- Modifying parameters
- Adding error codes

---

## Pull Request Process

### Before Creating PR

1. **Update from main**
```bash
git fetch origin
git rebase origin/main
```

2. **Run checks**
```bash
npm run typecheck
npm run lint
npm run build
```

3. **Test thoroughly**
- Manual testing
- Check all affected features
- Test on different devices

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Type check passes
- [ ] Linter passes
- [ ] Build succeeds
- [ ] Manual testing complete

## Screenshots (if applicable)
Add screenshots for UI changes

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
```

### PR Best Practices

- Keep PRs small and focused
- One feature/fix per PR
- Write clear description
- Add screenshots for UI changes
- Link related issues
- Request specific reviewers
- Respond to feedback promptly

---

## Code Review

### As a Reviewer

**What to check:**
- Code quality and style
- Type safety
- Error handling
- Performance implications
- Security concerns
- Documentation
- Test coverage

**How to review:**
- Be constructive
- Explain reasoning
- Suggest improvements
- Approve when ready

**Review comments:**
```markdown
# ✅ Good
Consider using useMemo here to avoid recalculation on every render:
```typescript
const result = useMemo(() => calculate(data), [data]);
```

# ❌ Bad
This is wrong, fix it.
```

### As an Author

**Responding to feedback:**
- Address all comments
- Ask for clarification if needed
- Make requested changes
- Mark conversations as resolved
- Thank reviewers

---

## Common Tasks

### Adding a New Page

1. **Create page file**
```typescript
// app/new-page/page.tsx
export default function NewPage() {
  return (
    <div>
      <h1>New Page</h1>
    </div>
  );
}
```

2. **Add navigation** (if needed)
```typescript
// Update navigation component
<Link href="/new-page">New Page</Link>
```

3. **Update types** (if needed)
```typescript
// lib/types.ts
export type NewPageData = {
  // ...
};
```

### Adding a New API Endpoint

1. **Create route file**
```typescript
// app/api/new-endpoint/route.ts
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const data = await fetchData();
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
}
```

2. **Add types**
```typescript
// lib/types.ts
export type NewEndpointResponse = {
  data: any;
};
```

3. **Update API documentation**
```markdown
// API.md
### New Endpoint
**GET** `/api/new-endpoint`
...
```

### Adding a New Component

1. **Create component file**
```typescript
// components/new-component.tsx
"use client"; // If interactive

interface NewComponentProps {
  title: string;
}

export function NewComponent({ title }: NewComponentProps) {
  return <div>{title}</div>;
}
```

2. **Export from index** (optional)
```typescript
// components/index.ts
export { NewComponent } from "./new-component";
```

3. **Use in page**
```typescript
import { NewComponent } from "@/components/new-component";

export default function Page() {
  return <NewComponent title="Hello" />;
}
```

### Updating Dependencies

```bash
# Check for updates
npm outdated

# Update specific package
npm update package-name

# Update all packages
npm update

# Test after updating
npm run typecheck
npm run lint
npm run build
```

---

## Getting Help

### Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev)
- Project [DOCUMENTATION.md](./DOCUMENTATION.md)

### Communication

- Open an issue for bugs
- Discuss features before implementing
- Ask questions in PR comments
- Contact maintainers for guidance

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

## Thank You!

Your contributions make this project better. We appreciate your time and effort!
