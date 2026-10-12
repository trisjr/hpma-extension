---
paths:
  - 'src/**/*.{ts,tsx}'
---

# React + TypeScript

## Components

- Functional components only, explicit `JSX.Element` return type; hooks, no classes.
- Small, focused components; colocate related code; file name `ComponentName.tsx`.
- Derive state instead of duplicating it; memoize only expensive work.

```tsx
import { JSX } from 'react';

export default function ComponentName(): JSX.Element {
  return (
    <div id='my-ext' className='container' data-theme='light'>
      {/* content */}
    </div>
  );
}
```

## TypeScript

- No `any`; prefer precise unions and generics. Exported APIs have explicit types.
- Functions named as verbs, variables as descriptive nouns.
- Early returns, shallow nesting.
- Don't swallow errors; avoid broad try/catch.
- Keep module side effects minimal; prefer pure utilities.
