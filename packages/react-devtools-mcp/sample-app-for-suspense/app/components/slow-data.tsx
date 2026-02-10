async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function SlowData() {
  await delay(1000);
  return (
    <div data-testid="slow-data">
      <h3>Slow Data Loaded</h3>
      <p>This data took 1 second to load.</p>
    </div>
  );
}

export async function OuterSlowData() {
  await delay(500);
  return (
    <div data-testid="outer-slow-data">
      <h3>Outer Data Loaded</h3>
      <p>This data took 500ms to load.</p>
    </div>
  );
}

export async function VerySlowData() {
  await delay(2000);
  return (
    <div data-testid="very-slow-data">
      <h3>Very Slow Data Loaded</h3>
      <p>This data took 2 seconds to load.</p>
    </div>
  );
}
