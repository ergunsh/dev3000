import {Suspense} from 'react';
import {SlowData, OuterSlowData, VerySlowData} from './components/slow-data';
import {ClientSuspenseDemo} from './components/client-suspense';

export default function Home() {
  return (
    <main data-testid="main">
      <h1>Suspense Test App</h1>

      {/* Pattern 1: Async Server Component in Suspense */}
      <section data-testid="pattern-1">
        <h2>Pattern 1: Async Server Component</h2>
        <Suspense
          fallback={
            <div data-testid="slow-loading">Loading slow data...</div>
          }
        >
          <SlowData />
        </Suspense>
      </section>

      {/* Pattern 2: Nested Suspense boundaries */}
      <section data-testid="pattern-2">
        <h2>Pattern 2: Nested Suspense</h2>
        <Suspense
          fallback={
            <div data-testid="outer-loading">Loading outer data...</div>
          }
        >
          <OuterSlowData />
          <Suspense
            fallback={
              <div data-testid="inner-loading">
                Loading very slow data...
              </div>
            }
          >
            <VerySlowData />
          </Suspense>
        </Suspense>
      </section>

      {/* Pattern 3: Client-side Suspense with use() */}
      <section data-testid="pattern-3">
        <h2>Pattern 3: Client Suspense</h2>
        <ClientSuspenseDemo />
      </section>
    </main>
  );
}
