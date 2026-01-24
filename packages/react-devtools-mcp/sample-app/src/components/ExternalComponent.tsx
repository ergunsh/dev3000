import {useState} from 'react';

/**
 * A component defined in a separate file to test that
 * find_component_source correctly identifies different source files.
 */
export function ExternalComponent() {
  const [count, setCount] = useState(0);

  return (
    <div className="external-component" data-testid="external-component">
      <h4>External Component</h4>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  );
}

export function AnotherExternalComponent({label}: {label: string}) {
  return (
    <span className="another-external" data-testid="another-external">
      {label}
    </span>
  );
}
