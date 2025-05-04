# Reply

A browser extension for enhanced online communication and interactions.

## Project Structure

```
reply/
├── extension/    # Browser extension code
└── userScript/   # User script implementation
```

## Installation

### Extension

```bash
cd extension
npm install
npm run build
```

### UserScript

```bash
cd userScript
npm install
npm run build
```

## Usage

### Functional API Examples

```javascript
// Transform data using pure functions
const processMessage = (message) => ({
    ...message,
    timestamp: Date.now(),
    processed: true,
});

// Compose functions
const pipeline = (...fns) => (initialValue) =>
    fns.reduce((value, fn) => fn(value), initialValue);

// Example usage with immutable data patterns
const enhanceReply = (reply) => {
    const enhance = pipeline(
        addMetadata,
        validateContent,
        formatText,
    );

    return enhance(reply);
};
```

## Contributing

Contributions welcome! Please follow the functional programming patterns
established in the codebase:

- Prefer pure functions
- Maintain immutability
- Use function composition
- Leverage higher-order functions

## License

MIT
