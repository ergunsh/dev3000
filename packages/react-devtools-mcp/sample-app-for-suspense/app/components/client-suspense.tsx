'use client';

import {Suspense, use, useState} from 'react';

function createDataPromise(id: number): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(`Client data #${id} loaded at ${new Date().toLocaleTimeString()}`);
    }, 800);
  });
}

function DataDisplay({dataPromise}: {dataPromise: Promise<string>}) {
  const data = use(dataPromise);
  return (
    <div data-testid="client-data">
      <p>{data}</p>
    </div>
  );
}

export function ClientSuspenseDemo() {
  const [fetchId, setFetchId] = useState(1);
  const [dataPromise, setDataPromise] = useState(() => createDataPromise(1));

  function handleRefetch() {
    const nextId = fetchId + 1;
    setFetchId(nextId);
    setDataPromise(createDataPromise(nextId));
  }

  return (
    <div data-testid="client-suspense-demo">
      <h3>Client Suspense with use()</h3>
      <button data-testid="refetch-button" onClick={handleRefetch}>
        Refetch (#{fetchId})
      </button>
      <Suspense
        fallback={
          <div data-testid="client-loading">Loading client data...</div>
        }
      >
        <DataDisplay dataPromise={dataPromise} />
      </Suspense>
    </div>
  );
}
