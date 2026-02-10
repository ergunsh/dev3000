# React Profiler Tools Specification

## Overview

Add two new tools to expose React Profiler functionality:
- `react_profiler_start` - Begin profiling session
- `react_profiler_stop` - End profiling and return results

## Tool: `react_profiler_start`

### Parameters
None

### Behavior
- Starts a React profiling session
- Returns error if profiling is already running

### Return Value
- Success message confirming profiling has started
- Error message if already profiling

---

## Tool: `react_profiler_stop`

### Parameters
None

### Behavior
- Stops the current profiling session
- Returns error if profiling wasn't started

### Return Value
Full flamegraph data as human-readable text showing:
- Per-component timing tree for each commit
- `actualDuration` (self): time the component alone took to render
- `baseDuration` (total): estimated time including children without memoization
- Component hierarchy with indentation

### Example Output
```
Profiling Results (3 commits captured)

Commit 1 (2.3ms total):
  App (self: 0.1ms, total: 2.3ms)
    Header (self: 0.2ms, total: 0.3ms)
      NavLink (self: 0.1ms)
    TodoList (self: 0.5ms, total: 1.8ms)
      TodoItem (self: 0.3ms)
      TodoItem (self: 0.4ms)

Commit 2 (0.8ms total):
  TodoList (self: 0.2ms, total: 0.8ms)
    TodoItem (self: 0.6ms)
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `start` called while already profiling | Return error message |
| `stop` called when not profiling | Return error message |

---

## Output Format

Text summary (human-readable), consistent with other tools in this package.
