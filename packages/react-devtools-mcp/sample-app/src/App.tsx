import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useContext,
  useRef,
  createContext,
  memo,
  forwardRef,
  Fragment,
  Suspense,
  lazy,
  type ReactNode,
} from 'react';
import {ExternalComponent, AnotherExternalComponent} from './components/ExternalComponent';

// Lazy-loaded component for testing Suspense
const LazyComponent = lazy(() =>
  new Promise<{default: React.ComponentType}>((resolve) => {
    // Simulate network delay
    setTimeout(() => {
      resolve({
        default: function LazyLoadedContent() {
          return (
            <div data-testid="lazy-content" style={{padding: '1rem', background: '#e0f7fa'}}>
              This content was loaded lazily after a delay.
            </div>
          );
        },
      });
    }, 1500);
  })
);

// Another lazy component with longer delay
const SlowLazyComponent = lazy(() =>
  new Promise<{default: React.ComponentType}>((resolve) => {
    setTimeout(() => {
      resolve({
        default: function SlowLoadedContent() {
          return (
            <div data-testid="slow-lazy-content" style={{padding: '1rem', background: '#fff3e0'}}>
              This content took longer to load.
            </div>
          );
        },
      });
    }, 3000);
  })
);

// ============================================
// Context for testing context inspection
// ============================================
interface ThemeContextValue {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
});

// ============================================
// Custom hook for testing hook inspection
// ============================================
function useCustomCounter(initialValue: number) {
  const [count, setCount] = useState(initialValue);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  const decrement = useCallback(() => setCount((c) => c - 1), []);
  return {count, increment, decrement};
}

// ============================================
// Counter component with various hooks
// ============================================
interface CounterProps {
  initialCount?: number;
  label: string;
  onCountChange?: (count: number) => void;
}

function Counter({initialCount = 0, label, onCountChange}: CounterProps) {
  const [count, setCount] = useState(initialCount);
  const renderCountRef = useRef(0);

  const increment = useCallback(() => {
    setCount((c) => c + 1);
  }, []);

  const decrement = useCallback(() => {
    setCount((c) => c - 1);
  }, []);

  const doubled = useMemo(() => count * 2, [count]);

  useEffect(() => {
    renderCountRef.current += 1;
    onCountChange?.(count);
  }, [count, onCountChange]);

  return (
    <div style={{marginBottom: '1rem'}} data-testid={`counter-${label}`}>
      <h3>{label}</h3>
      <button onClick={decrement}>-</button>
      <span style={{margin: '0 1rem'}}>
        {count} (doubled: {doubled})
      </span>
      <button onClick={increment}>+</button>
      <span style={{marginLeft: '1rem', fontSize: '0.8em', color: '#666'}}>
        Renders: {renderCountRef.current}
      </span>
    </div>
  );
}

// ============================================
// Timer component with useEffect
// ============================================
function Timer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return <p data-testid="timer">Timer: {seconds}s</p>;
}

// ============================================
// Memoized component
// ============================================
interface MemoizedDisplayProps {
  value: string;
  count: number;
}

const MemoizedDisplay = memo(function MemoizedDisplay({
  value,
  count,
}: MemoizedDisplayProps) {
  return (
    <div data-testid="memoized-display">
      Memoized: {value} (count: {count})
    </div>
  );
});

// ============================================
// ForwardRef component
// ============================================
interface ForwardRefInputProps {
  placeholder?: string;
}

const ForwardRefInput = forwardRef<HTMLInputElement, ForwardRefInputProps>(
  function ForwardRefInput({placeholder = 'Type here...'}, ref) {
    return (
      <input
        ref={ref}
        placeholder={placeholder}
        style={{padding: '0.5rem', marginBottom: '1rem'}}
        data-testid="forwarded-input"
      />
    );
  }
);

// ============================================
// Context consumer component
// ============================================
function ThemeDisplay() {
  const {theme} = useContext(ThemeContext);
  return (
    <div
      data-testid="theme-display"
      style={{
        padding: '0.5rem',
        background: theme === 'dark' ? '#333' : '#eee',
        color: theme === 'dark' ? '#fff' : '#000',
      }}
    >
      Current theme: {theme}
    </div>
  );
}

// ============================================
// Deeply nested components
// ============================================
interface NestedLevelProps {
  level: number;
  maxLevel: number;
  children?: ReactNode;
}

function NestedLevel({level, maxLevel, children}: NestedLevelProps) {
  if (level >= maxLevel) {
    return (
      <div data-testid={`nested-level-${level}`}>Leaf at level {level}</div>
    );
  }

  return (
    <div data-testid={`nested-level-${level}`} style={{paddingLeft: '1rem'}}>
      Level {level}
      <NestedLevel level={level + 1} maxLevel={maxLevel}>
        {children}
      </NestedLevel>
    </div>
  );
}

// ============================================
// List with keys
// ============================================
interface ListItem {
  id: string;
  name: string;
}

interface ItemListProps {
  items: ListItem[];
}

function ItemList({items}: ItemListProps) {
  return (
    <ul data-testid="item-list">
      {items.map((item) => (
        <li key={item.id} data-testid={`item-${item.id}`}>
          {item.name}
        </li>
      ))}
    </ul>
  );
}

// ============================================
// Component with various prop types
// ============================================
interface ComplexPropsComponentProps {
  stringProp: string;
  numberProp: number;
  booleanProp: boolean;
  arrayProp: string[];
  objectProp: {name: string; value: number};
  functionProp: () => void;
  nullProp: null;
  undefinedProp?: undefined;
  reactElementProp: ReactNode;
  symbolProp?: symbol;
}

function ComplexPropsComponent({
  stringProp,
  numberProp,
  booleanProp,
  arrayProp,
  objectProp,
  functionProp,
  nullProp,
  undefinedProp,
  reactElementProp,
}: ComplexPropsComponentProps) {
  return (
    <div data-testid="complex-props">
      <p>String: {stringProp}</p>
      <p>Number: {numberProp}</p>
      <p>Boolean: {booleanProp ? 'true' : 'false'}</p>
      <p>Array length: {arrayProp.length}</p>
      <p>
        Object: {objectProp.name}={objectProp.value}
      </p>
      <p>Function: {typeof functionProp}</p>
      <p>Null: {String(nullProp)}</p>
      <p>Undefined: {String(undefinedProp)}</p>
      <p>React element: {reactElementProp}</p>
    </div>
  );
}

// ============================================
// Component using custom hook
// ============================================
function CustomHookComponent() {
  const {count, increment, decrement} = useCustomCounter(10);

  return (
    <div data-testid="custom-hook-component">
      <span>Custom Hook Count: {count}</span>
      <button onClick={decrement}>-</button>
      <button onClick={increment}>+</button>
    </div>
  );
}

// ============================================
// Error boundary test component
// This component logs warnings in render
// ============================================
function WarningComponent() {
  // This triggers a console.error in development
  useEffect(() => {
    // Log a warning that React DevTools can pick up
    console.error('Test warning from WarningComponent');
  }, []);

  return <div data-testid="warning-component">Warning Component</div>;
}

// ============================================
// Fragment wrapper component
// ============================================
function FragmentWrapper({children}: {children: ReactNode}) {
  return <Fragment>{children}</Fragment>;
}

// ============================================
// Component with multiple hooks of same type
// ============================================
function MultipleHooksComponent() {
  const [firstName, setFirstName] = useState('John');
  const [lastName, setLastName] = useState('Doe');
  const [age, setAge] = useState(30);

  const fullName = useMemo(
    () => `${firstName} ${lastName}`,
    [firstName, lastName]
  );
  const isAdult = useMemo(() => age >= 18, [age]);

  const updateFirstName = useCallback((name: string) => {
    setFirstName(name);
  }, []);

  const updateLastName = useCallback((name: string) => {
    setLastName(name);
  }, []);

  return (
    <div data-testid="multiple-hooks">
      <p>Full Name: {fullName}</p>
      <p>Age: {age}</p>
      <p>Is Adult: {isAdult ? 'Yes' : 'No'}</p>
      <button onClick={() => updateFirstName('Jane')}>Change to Jane</button>
      <button onClick={() => updateLastName('Smith')}>Change to Smith</button>
      <button onClick={() => setAge((a) => a + 1)}>Increment Age</button>
    </div>
  );
}

// ============================================
// Sibling components for search testing
// ============================================
function SearchableAlpha() {
  return <div data-testid="searchable-alpha">Alpha Component</div>;
}

function SearchableBeta() {
  return <div data-testid="searchable-beta">Beta Component</div>;
}

function SearchableGamma() {
  return <div data-testid="searchable-gamma">Gamma Component</div>;
}

// Components with similar names for case-sensitivity testing
function CounterDisplay() {
  return <div data-testid="counter-display">Counter Display</div>;
}

function counterHelper() {
  // lowercase function component (unusual but valid)
  return <div data-testid="counter-helper">Counter Helper</div>;
}
// Capitalize for use as component
const CounterHelper = counterHelper;

// ============================================
// Components for find-component-source testing
// ============================================
interface StyledSectionProps {
  children: ReactNode;
  title?: string;
}

function StyledSection({children, title}: StyledSectionProps) {
  return (
    <section className="styled-section" data-testid="styled-section">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  );
}

function ButtonWrapper() {
  return (
    <div className="button-wrapper" data-testid="button-wrapper">
      <button className="raw-button" data-testid="raw-button">
        Click me
      </button>
    </div>
  );
}

// ============================================
// Main App Component
// ============================================
function App() {
  const [showTimer, setShowTimer] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  const themeValue = useMemo(
    () => ({theme, toggleTheme}),
    [theme, toggleTheme]
  );

  const listItems: ListItem[] = useMemo(
    () => [
      {id: 'item-1', name: 'First Item'},
      {id: 'item-2', name: 'Second Item'},
      {id: 'item-3', name: 'Third Item'},
    ],
    []
  );

  const handleButtonClick = useCallback(() => {
    console.log('Button clicked');
  }, []);

  return (
    <ThemeContext.Provider value={themeValue}>
      <div
        style={{
          padding: '2rem',
          fontFamily: 'sans-serif',
          background: theme === 'dark' ? '#222' : '#fff',
          color: theme === 'dark' ? '#fff' : '#000',
          minHeight: '100vh',
        }}
        data-testid="app-root"
      >
        <h1>Sample React App for E2E Testing</h1>
        <p>This app is used for testing react-devtools-mcp functionality.</p>

        <section style={{marginBottom: '2rem'}}>
          <h2>Counters (multiple instances)</h2>
          <Counter label="Counter A" initialCount={5} />
          <Counter label="Counter B" />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Timer (conditional rendering)</h2>
          <label>
            <input
              type="checkbox"
              checked={showTimer}
              onChange={(e) => setShowTimer(e.target.checked)}
            />
            Show Timer
          </label>
          {showTimer && <Timer />}
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Theme Context</h2>
          <button onClick={toggleTheme}>Toggle Theme</button>
          <ThemeDisplay />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Memoized & ForwardRef Components</h2>
          <MemoizedDisplay value="test-value" count={42} />
          <ForwardRefInput ref={inputRef} placeholder="Forwarded ref input" />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Deeply Nested Components</h2>
          <NestedLevel level={1} maxLevel={5} />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>List with Keys</h2>
          <ItemList items={listItems} />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Complex Props</h2>
          <ComplexPropsComponent
            stringProp="hello world"
            numberProp={42}
            booleanProp={true}
            arrayProp={['a', 'b', 'c']}
            objectProp={{name: 'test', value: 100}}
            functionProp={handleButtonClick}
            nullProp={null}
            undefinedProp={undefined}
            reactElementProp={<span>Nested Element</span>}
          />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Custom Hook</h2>
          <CustomHookComponent />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Multiple Hooks of Same Type</h2>
          <MultipleHooksComponent />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Searchable Components</h2>
          <FragmentWrapper>
            <SearchableAlpha />
            <SearchableBeta />
            <SearchableGamma />
          </FragmentWrapper>
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Counter-related Components (case sensitivity)</h2>
          <CounterDisplay />
          <CounterHelper />
        </section>

        <section style={{marginBottom: '2rem'}}>
          <h2>Warning Component (toggle to show)</h2>
          <label>
            <input
              type="checkbox"
              checked={showWarning}
              onChange={(e) => setShowWarning(e.target.checked)}
            />
            Show Warning Component
          </label>
          {showWarning && <WarningComponent />}
        </section>

        <StyledSection title="Find Component Source Test">
          <p>This section tests DOM-to-component mapping.</p>
          <ButtonWrapper />
          <ExternalComponent />
          <AnotherExternalComponent label="External label" />
        </StyledSection>

        <section style={{marginBottom: '2rem'}}>
          <h2>Suspense Boundaries</h2>
          <p>These components use React Suspense for lazy loading.</p>

          <Suspense
            fallback={
              <div style={{padding: '1rem', background: '#f5f5f5'}}>
                Loading lazy component...
              </div>
            }
          >
            <LazyComponent />
          </Suspense>

          <div style={{marginTop: '1rem'}}>
            <Suspense
              fallback={
                <div style={{padding: '1rem', background: '#f5f5f5'}}>
                  Loading slow component...
                </div>
              }
            >
              <Suspense
                fallback={
                  <div style={{padding: '0.5rem', background: '#eeeeee'}}>
                    Nested suspense loading...
                  </div>
                }
              >
                <SlowLazyComponent />
              </Suspense>
            </Suspense>
          </div>
        </section>
      </div>
    </ThemeContext.Provider>
  );
}

export default App;
